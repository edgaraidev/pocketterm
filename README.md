# PocketTerm

**PocketTerm** is a high-fidelity, browser-based Rocky Linux 9 simulation. Unlike typical terminal emulators, it features a custom **AST-based shell interpreter** and a persistent **Filesystem Hierarchy Standard (FHS)** engine.

It is designed for educational sandboxing, sysadmin training, and realistic operational workflows without the overhead of a local VM.

---

## 🚀 Technical Pillars

### 1. Custom AST Shell Engine
* **Lexical Analysis:** Custom lexer/parser that builds an Abstract Syntax Tree (AST) for robust command execution.
* **Scripting Support:** Native execution of `.sh` and `bash` scripts with `set -e` / `set -x` debugging and sequential logic.
* **Pipes & Redirection:** Real-time stream handling for stdout redirection and complex command piping.

### 2. Filesystem Fidelity (FHS)
* **VFS Architecture:** A stateful virtual filesystem compliant with the Filesystem Hierarchy Standard (FHS).
* **Canonical Pathing:** Real resolution for `/usr/bin`, `/etc`, `/var`, and `/home/guest`.
* **Persistence:** System state—including installed packages and environment variables—is committed to browser storage and survives `reboot` cycles.

### 3. Integrated Tooling & Service Stack
* **Package Management:** Stateful `dnf` workflow with dependency resolution and install-to-unlock mechanics.
* **Hardware Simulation:** Authentic `/proc` filesystem (uptime, cpuinfo, meminfo) and dynamic `lsblk` integration.
* **Identity Management:** Simulated user/group stack with `useradd`, `passwd`, and `sudo` elevation.

---

## 🛠 Project Highlights

* **Boot Lifecycle:** Complete simulation from BIOS/GRUB through kernel boot to the login prompt.
* **Interactive Tools:** Full-featured `top`, `htop`, `less`, `tail -f`, and `journalctl -xe`.
* **Authentic Documentation:** Integrated `man` subsystem with high-fidelity manual pages (try `man pocketterm`).
* **Networking:** Real-world `curl` integration via browser-backed fetch (try `curl https://api.github.com/zen`).

---

## 📂 Project Structure

- `src/engine/` - Core shell engine, VFS, AST parser, and command modules.
- `src/components/` - Terminal UI, xterm.js integration, and editor overlays.
- `src/App.tsx` - System state machine (BIOS -> GRUB -> Boot -> OS).

---

## 🚧 Known Simulation Boundaries

* **Networking:** Simulated bridge; does not expose host-level sockets for security.
* **Permissions:** Simplified ownership model optimized for educational workflows.
* **Hardware:** Block devices are simulated; `fdisk` and `mkfs` are staged but non-destructive to host hardware.

---

## 🤝 Support & Connect

*If you find this project useful or enjoy the nostalgia, feel free to connect or support the development!*

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow?style=flat-square&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/edgar.ai.dev)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/edgar-furse-7643b3ba/)


---
License: MIT
