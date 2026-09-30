#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()

if __name__ == "__main__":
    print("Serving webemu48 demo at http://127.0.0.1:8000/")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
