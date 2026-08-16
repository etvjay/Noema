#!/usr/bin/env python3
"""Persistent agy (Antigravity CLI) daemon for Noema.

Runs `agy` inside a PTY in /workspaces/Noema, keeps it alive, and exposes a
command FIFO so an orchestrator can inject prompts. On container restart the
devcontainer postStartCommand relaunches this daemon; `--continue` resumes the
last conversation so long-running missions survive reboots.
"""
import pty, os, sys, time, select, re, fcntl, termios, struct

WORKSPACE = "/workspaces/Noema"
FIFO = "/tmp/agy_cmd_fifo"
SESSION_LOG = "/tmp/agy_session.log"
STATUS_FILE = "/tmp/agy_status.txt"
ROWS, COLS = 40, 100

def main():
    os.chdir(WORKSPACE)
    if os.path.exists(FIFO):
        os.unlink(FIFO)
    os.mkfifo(FIFO)

    argv = ["agy", "--dangerously-skip-permissions"]
    if "--continue" in sys.argv:
        argv.append("--continue")

    win = struct.pack("HHHH", ROWS, COLS, 0, 0)
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.environ["SSH_TTY"] = "/dev/pts/9"
        os.environ["SSH_CONNECTION"] = "::1 51192 ::1 2222"
        os.environ["COLUMNS"] = str(COLS)
        os.environ["LINES"] = str(ROWS)
        os.execvp(argv[0], argv)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, win)

    log = open(SESSION_LOG, "ab", buffering=0)
    buf = b""
    fifo_fd = None

    def logdata(d):
        log.write(d)
        log.flush()

    while True:
        if fifo_fd is None:
            try:
                fifo_fd = os.open(FIFO, os.O_RDONLY | os.O_NONBLOCK)
            except OSError:
                fifo_fd = None
        r, _, _ = select.select([fd] + ([fifo_fd] if fifo_fd is not None else []), [], [], 0.3)
        for s in r:
            if s == fd:
                try:
                    data = os.read(fd, 8192)
                except OSError:
                    data = b""
                if not data:
                    open(STATUS_FILE, "w").write("EXITED")
                    sys.exit(0)
                buf += data
                logdata(data)
                resp = b""
                for m in re.findall(rb"\x1b\[\?([0-9]+)\$p", data):
                    resp += b"\x1b[?" + m + b";1$y"
                if re.search(rb"\x1b\[\?u", data):
                    resp += b"\x1b[?1;2u"
                if resp:
                    os.write(fd, resp)
            else:
                try:
                    code = os.read(s, 8192)
                except OSError:
                    code = b""
                if code:
                    os.write(fd, code)
                    logdata(b"\n>>>CMD_INJECTED<<<\n")
        if b"trust this folder" in buf:
            time.sleep(1.0)
            os.write(fd, b"\r")
            buf = buf.replace(b"trust this folder", b"trusted-accepted")

if __name__ == "__main__":
    main()
