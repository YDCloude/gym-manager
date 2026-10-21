"""Tiny static server for Gym Manager (no dependencies).

Usage:
  python server.py [port] [--lan] [--dir folder]

  port      default 8765
  --lan     also listen on your Wi-Fi network so a phone on the same network can open
            http://<this-pc-ip>:<port>  (prints the address)
  --dir     serve another folder, e.g. `--dir dist` to try the hosted build

Always open the app at the same address: browsers keep your saved workouts per address.
"""
import functools
import http.server
import socket
import socketserver
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Code files must always be revalidated so updates show up immediately;
        # the big image/GIF assets can be cached.
        if self.path.split("?")[0].endswith((".js", ".css", ".html", ".webmanifest", "/")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))  # no packet is sent; just picks the outgoing interface
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


if __name__ == "__main__":
    args = sys.argv[1:]
    lan = "--lan" in args
    folder = args[args.index("--dir") + 1] if "--dir" in args else "."
    nums = [a for a in args if a.isdigit()]
    port = int(nums[0]) if nums else 8765
    host = "0.0.0.0" if lan else "127.0.0.1"
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(Handler, directory=folder)
    with socketserver.ThreadingTCPServer((host, port), handler) as httpd:
        print("Gym Manager running (Ctrl+C to stop)")
        print("  On this computer:  http://localhost:%d/" % port)
        if lan:
            ip = lan_ip()
            print("  On your phone:     http://%s:%d/   (same Wi-Fi network)" % (ip or "<your-pc-ip>", port))
            print("  If it does not open, allow Python through the Windows firewall for private networks.")
        httpd.serve_forever()
