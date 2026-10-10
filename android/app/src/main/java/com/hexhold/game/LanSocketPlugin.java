package com.hexhold.game;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.SystemClock;
import android.webkit.WebView;
import android.content.pm.PackageInfo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

/**
 * Moves length-prefixed UTF-8 JSON frames between phones on the same LAN.
 * It holds no game or room state: the TypeScript host decides everything (PRD 5, 7).
 */
@CapacitorPlugin(name = "LanSocket")
public class LanSocketPlugin extends Plugin {
    static final int MAX_FRAME_BYTES = 1 << 20;
    static final int SEND_BUFFER_BYTES = 96 * 1024;
    static final int MAX_RELIABLE_FRAMES = 64;
    static final long MAX_QUEUED_BYTES = 4L * 1024 * 1024;
    static final long MAX_QUEUE_AGE_MS = 3000;
    // Anyone on the same Wi-Fi can connect; refuse beyond this many inbound sockets (the JS host also caps peers).
    static final int MAX_INBOUND = 8;
    // VPN, tunnel, cellular and virtual interfaces never carry the hotspot or Wi-Fi LAN (PRD 6.4).
    static final Pattern EXCLUDED_INTERFACE = Pattern.compile("^(tun|ppp|ipsec|rmnet|ccmni|dummy|clat|v4-|lo|p2p|aware|nan|bt-pan).*");

    private final Map<String, Connection> connections = new ConcurrentHashMap<>();
    private final AtomicInteger nextConnection = new AtomicInteger();
    private volatile ServerSocket server;
    // The last bound endpoint, so the listener can be reopened with the same room code after the OS broke it.
    private volatile InetSocketAddress lastEndpoint;

    // ---------- diagnostics ----------

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("model", Build.MODEL);
        r.put("manufacturer", Build.MANUFACTURER);
        r.put("release", Build.VERSION.RELEASE);
        r.put("sdk", Build.VERSION.SDK_INT);
        PackageInfo webView = Build.VERSION.SDK_INT >= 26 ? WebView.getCurrentWebViewPackage() : null;
        r.put("webView", webView == null ? null : webView.packageName + " " + webView.versionName);
        call.resolve(r);
    }

    @PluginMethod
    public void addressCandidates(PluginCall call) {
        call.resolve(selectAddress());
    }

    // ---------- host ----------

    @PluginMethod
    public void listen(PluginCall call) {
        int basePort = call.getInt("basePort", 47610);
        int slots = call.getInt("slots", 8);
        if (server != null) { call.reject("ALREADY_LISTENING"); return; }
        JSObject selection = selectAddress();
        String address = selection.getString("address");
        if (address == null) {
            // No single LAN address: issue no code rather than listen somewhere unreachable (PRD 6.4).
            JSObject r = new JSObject();
            r.put("port", -1); r.put("slot", -1); r.put("address", null);
            r.put("addressError", selection.getString("error"));
            r.put("candidates", selection.opt("candidates"));
            call.resolve(r);
            return;
        }
        InetAddress bindAddress;
        try { bindAddress = InetAddress.getByName(address); } catch (IOException e) { call.reject("BAD_ADDRESS", e); return; }
        // Listen only on the LAN address carried by the room code, never on every interface: a wildcard bind
        // would also accept connections over mobile data, where an IPv6 address can be reachable from the internet.
        ServerSocket bound = null; int slot = -1;
        for (int i = 0; i < slots && bound == null; i++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(bindAddress, basePort + i));
                bound = s; slot = i;
            } catch (IOException ignored) { }
        }
        if (bound == null) { call.reject("NO_FREE_PORT"); return; }
        server = bound;
        lastEndpoint = new InetSocketAddress(bindAddress, basePort + slot);
        startAccepting(bound);
        JSObject r = new JSObject();
        r.put("port", basePort + slot);
        r.put("slot", slot);
        r.put("address", address);
        r.put("addressError", null);
        r.put("candidates", selection.opt("candidates"));
        call.resolve(r);
    }

    /**
     * Android blocks a backgrounded app's network after a few seconds; when the host comes back, make sure the
     * listener on the same address and port (the room code) is open again.
     */
    @PluginMethod
    public void ensureListening(PluginCall call) {
        ServerSocket current = server;
        InetSocketAddress endpoint = lastEndpoint;
        JSObject r = new JSObject();
        if (endpoint == null || (current != null && !current.isClosed() && current.isBound())) { r.put("reopened", false); call.resolve(r); return; }
        try {
            ServerSocket s = new ServerSocket();
            s.setReuseAddress(true);
            s.bind(endpoint);
            server = s;
            startAccepting(s);
            r.put("reopened", true);
            call.resolve(r);
        } catch (IOException e) {
            call.reject("RELISTEN_FAILED", e);
        }
    }

    private void startAccepting(ServerSocket listening) {
        Thread accept = new Thread(() -> {
            while (!listening.isClosed()) {
                try {
                    Socket socket = listening.accept();
                    if (inboundCount() >= MAX_INBOUND) { try { socket.close(); } catch (IOException ignored) { } continue; }
                    Connection c = open(socket, false, true);
                    JSObject e = new JSObject();
                    e.put("connectionId", c.id);
                    e.put("remote", socket.getInetAddress().getHostAddress());
                    notifyListeners("connection", e);
                } catch (IOException ex) {
                    if (listening.isClosed()) break;
                    emitServerError(ex);
                    // Network blocked (app in background): back off instead of spinning on accept errors.
                    try { Thread.sleep(500); } catch (InterruptedException ie) { break; }
                }
            }
        }, "lan-accept");
        accept.setDaemon(true);
        accept.start();
    }

    @PluginMethod
    public void closeServer(PluginCall call) {
        ServerSocket s = server; server = null; lastEndpoint = null;
        if (s != null) try { s.close(); } catch (IOException ignored) { }
        for (Connection c : connections.values()) c.close("SERVER_CLOSED");
        call.resolve();
    }

    // ---------- guest ----------

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        int port = call.getInt("port", 0);
        int timeoutMs = call.getInt("timeoutMs", 10000);
        if (address == null || port <= 0) { call.reject("INVALID_INPUT"); return; }
        new Thread(() -> {
            Socket socket = null;
            boolean[] boundToWifi = new boolean[1];
            try {
                socket = createWifiBoundSocket(boundToWifi);
                socket.connect(new InetSocketAddress(address, port), timeoutMs);
                Connection c = open(socket, boundToWifi[0], false);
                JSObject r = new JSObject();
                r.put("connectionId", c.id);
                r.put("boundToWifi", c.boundToWifi);
                call.resolve(r);
            } catch (IOException ex) {
                if (socket != null) try { socket.close(); } catch (IOException ignored) { }
                call.reject(ex instanceof java.net.SocketTimeoutException ? "TIMEOUT" : "CONNECT_FAILED", ex);
            }
        }, "lan-connect").start();
    }

    /**
     * Android may route sockets over cellular when the Wi-Fi network has no internet (hotspots, offline routers).
     * Bind to the Wi-Fi Network explicitly so a private address is reached over Wi-Fi (PRD 7.4).
     */
    private Socket createWifiBoundSocket(boolean[] boundToWifi) throws IOException {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(n);
            if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                boundToWifi[0] = true;
                return n.getSocketFactory().createSocket();
            }
        }
        return new Socket();
    }

    // ---------- both ----------

    @PluginMethod
    public void send(PluginCall call) {
        Connection c = connections.get(call.getString("connectionId", ""));
        String data = call.getString("data");
        if (c == null) { call.reject("NO_CONNECTION"); return; }
        if (data == null) { call.reject("INVALID_INPUT"); return; }
        String replaceKey = call.getBoolean("replaceable", false) ? call.getString("replaceKey", "") : null;
        c.enqueue(data.getBytes(StandardCharsets.UTF_8), replaceKey);
        call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        Connection c = connections.get(call.getString("connectionId", ""));
        if (c != null) c.close("LOCAL_CLOSE");
        call.resolve();
    }

    @PluginMethod
    public void stats(PluginCall call) {
        Connection c = connections.get(call.getString("connectionId", ""));
        if (c == null) { call.reject("NO_CONNECTION"); return; }
        call.resolve(c.stats());
    }

    @Override
    protected void handleOnDestroy() {
        ServerSocket s = server; server = null;
        if (s != null) try { s.close(); } catch (IOException ignored) { }
        for (Connection c : connections.values()) c.close("APP_DESTROYED");
    }

    private int inboundCount() {
        int n = 0;
        for (Connection c : connections.values()) if (c.inbound) n++;
        return n;
    }

    private Connection open(Socket socket, boolean boundToWifi, boolean inbound) throws IOException {
        socket.setTcpNoDelay(true);
        socket.setSendBufferSize(SEND_BUFFER_BYTES);
        socket.setKeepAlive(true);
        Connection c = new Connection("c" + nextConnection.incrementAndGet(), socket, boundToWifi, inbound);
        connections.put(c.id, c);
        c.start();
        return c;
    }

    private void emitServerError(IOException ex) {
        JSObject e = new JSObject();
        e.put("connectionId", "server");
        e.put("reason", "ACCEPT_FAILED: " + ex.getMessage());
        notifyListeners("close", e);
    }

    // ---------- address selection (PRD 6.4) ----------

    private JSObject selectAddress() {
        JSArray candidates = new JSArray();
        Set<String> wifiInterfaces = new HashSet<>(), excludedInterfaces = new HashSet<>();
        List<String> wifi = new ArrayList<>(), hotspot = new ArrayList<>();
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(n);
            LinkProperties lp = cm.getLinkProperties(n);
            if (caps == null || lp == null) continue;
            boolean isVpn = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
            boolean isCell = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR);
            if (isVpn || isCell) { if (lp.getInterfaceName() != null) excludedInterfaces.add(lp.getInterfaceName()); continue; }
            if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
            if (lp.getInterfaceName() != null) wifiInterfaces.add(lp.getInterfaceName());
            for (LinkAddress la : lp.getLinkAddresses()) {
                InetAddress a = la.getAddress();
                if (a instanceof Inet4Address && isPrivate((Inet4Address) a)) {
                    wifi.add(a.getHostAddress());
                    candidates.put(candidate(lp.getInterfaceName(), a.getHostAddress(), "WIFI_CLIENT", true));
                }
            }
        }
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                String name = ni.getName();
                if (wifiInterfaces.contains(name)) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address)) continue;
                    boolean up; try { up = ni.isUp() && !ni.isLoopback(); } catch (IOException e) { up = false; }
                    boolean ok = up && isPrivate((Inet4Address) a) && !excludedInterfaces.contains(name) && !EXCLUDED_INTERFACE.matcher(name).matches();
                    candidates.put(candidate(name, a.getHostAddress(), ok ? "HOTSPOT_OR_LAN" : "EXCLUDED", ok));
                    if (ok) hotspot.add(a.getHostAddress());
                }
            }
        } catch (IOException ignored) { }
        List<String> all = new ArrayList<>(wifi); all.addAll(hotspot);
        JSObject r = new JSObject();
        r.put("candidates", candidates);
        // Never guess: an unreachable code is worse than a clear failure (PRD 6.4 step 3).
        if (all.size() == 1) { r.put("address", all.get(0)); r.put("error", null); }
        else { r.put("address", null); r.put("error", all.isEmpty() ? "NO_ADDRESS" : "AMBIGUOUS_ADDRESS"); }
        return r;
    }

    private static JSObject candidate(String iface, String address, String kind, boolean eligible) {
        JSObject o = new JSObject();
        o.put("interface", iface); o.put("address", address); o.put("kind", kind); o.put("eligible", eligible);
        return o;
    }

    static boolean isPrivate(Inet4Address a) {
        byte[] b = a.getAddress();
        int x = b[0] & 255, y = b[1] & 255;
        return x == 10 || (x == 172 && y >= 16 && y <= 31) || (x == 192 && y == 168);
    }

    // ---------- connection ----------

    private static final class Frame {
        final byte[] bytes; final String replaceKey; final long queuedAt;
        Frame(byte[] bytes, String replaceKey) { this.bytes = bytes; this.replaceKey = replaceKey; this.queuedAt = SystemClock.elapsedRealtime(); }
    }

    private final class Connection {
        final String id; final Socket socket; final boolean boundToWifi; final boolean inbound;
        final ArrayDeque<Frame> queue = new ArrayDeque<>();
        long queuedBytes, sentFrames, sentBytes, receivedFrames, receivedBytes, replacedFrames, maxQueueAgeMs;
        int reliableQueued, maxQueueLength;
        volatile boolean closed;

        Connection(String id, Socket socket, boolean boundToWifi, boolean inbound) { this.id = id; this.socket = socket; this.boundToWifi = boundToWifi; this.inbound = inbound; }

        void start() {
            Thread reader = new Thread(this::readLoop, "lan-read-" + id); reader.setDaemon(true); reader.start();
            Thread writer = new Thread(this::writeLoop, "lan-write-" + id); writer.setDaemon(true); writer.start();
        }

        /** Replacement happens only before the socket write, and only at the queue tail with the same key (PRD 7.3). */
        void enqueue(byte[] bytes, String replaceKey) {
            String overflow = null;
            synchronized (queue) {
                if (closed) return;
                Frame tail = queue.peekLast();
                if (replaceKey != null && tail != null && replaceKey.equals(tail.replaceKey)) {
                    queue.pollLast(); queuedBytes -= tail.bytes.length; replacedFrames++;
                } else if (replaceKey == null) reliableQueued++;
                queue.addLast(new Frame(bytes, replaceKey));
                queuedBytes += bytes.length;
                maxQueueLength = Math.max(maxQueueLength, queue.size());
                Frame head = queue.peekFirst();
                long age = head == null ? 0 : SystemClock.elapsedRealtime() - head.queuedAt;
                maxQueueAgeMs = Math.max(maxQueueAgeMs, age);
                if (reliableQueued > MAX_RELIABLE_FRAMES || queuedBytes > MAX_QUEUED_BYTES) overflow = "SLOW_PEER_QUEUE";
                else if (age > MAX_QUEUE_AGE_MS) overflow = "SLOW_PEER_AGE";
                else queue.notifyAll();
            }
            if (overflow != null) close(overflow);
        }

        void writeLoop() {
            try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream(), 64 * 1024))) {
                while (!closed) {
                    Frame f;
                    synchronized (queue) {
                        while (queue.isEmpty() && !closed) queue.wait();
                        if (closed) break;
                        f = queue.pollFirst();
                        queuedBytes -= f.bytes.length;
                        if (f.replaceKey == null) reliableQueued--;
                    }
                    out.writeInt(f.bytes.length);
                    out.write(f.bytes);
                    out.flush();
                    synchronized (queue) { sentFrames++; sentBytes += f.bytes.length; }
                }
            } catch (IOException | InterruptedException ex) {
                close("WRITE_FAILED");
            }
        }

        void readLoop() {
            try (DataInputStream in = new DataInputStream(new BufferedInputStream(socket.getInputStream(), 64 * 1024))) {
                while (!closed) {
                    int length = in.readInt();
                    if (length < 0 || length > MAX_FRAME_BYTES) { close("FRAME_TOO_LARGE"); return; }
                    byte[] bytes = new byte[length];
                    in.readFully(bytes);
                    synchronized (queue) { receivedFrames++; receivedBytes += length; }
                    JSObject e = new JSObject();
                    e.put("connectionId", id);
                    e.put("data", new String(bytes, StandardCharsets.UTF_8));
                    notifyListeners("message", e);
                }
            } catch (java.io.EOFException ex) {
                close("REMOTE_CLOSED");
            } catch (IOException ex) {
                // Distinguish a clean remote close from the network vanishing (Wi-Fi switch, hotspot off).
                close("NETWORK_ERROR");
            }
        }

        void close(String reason) {
            synchronized (queue) {
                if (closed) return;
                closed = true;
                queue.clear();
                queue.notifyAll();
            }
            try { socket.close(); } catch (IOException ignored) { }
            connections.remove(id);
            JSObject e = new JSObject();
            e.put("connectionId", id);
            e.put("reason", reason);
            notifyListeners("close", e);
        }

        JSObject stats() {
            JSObject r = new JSObject();
            synchronized (queue) {
                Frame head = queue.peekFirst();
                r.put("queueLength", queue.size());
                r.put("queuedBytes", queuedBytes);
                r.put("queueAgeMs", head == null ? 0 : SystemClock.elapsedRealtime() - head.queuedAt);
                r.put("maxQueueLength", maxQueueLength);
                r.put("maxQueueAgeMs", maxQueueAgeMs);
                r.put("replacedFrames", replacedFrames);
                r.put("sentFrames", sentFrames);
                r.put("sentBytes", sentBytes);
                r.put("receivedFrames", receivedFrames);
                r.put("receivedBytes", receivedBytes);
                r.put("boundToWifi", boundToWifi);
            }
            return r;
        }
    }
}
