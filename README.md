# Skyward Ambition · Private Birthday Experience & Storybook

An interactive, chapter-based birthday gift experience and private memory vault designed with profound admiration, gratitude, and respect for **Ma'am**.

---

## ✈️ Experience Architecture

1. **Gate 1 — Secret Security Gate**
   - Minimalist luxury midnight navy atmosphere with radar telemetry and animated security lock.
   - 8-digit masked PIN entry with mobile-friendly on-screen numeric keypad and physical keyboard support.
   - Secure verification with salted SHA-256 cryptographic hashes and session management.

2. **The Interactive Storybook (7 Chapters & Cryptographic Puzzles)**
   - **Chapter 1 — The Beginning**: Fighter pilot ambition tribute & logical deduction challenge (*Secret Word: COURAGE*).
   - **Chapter 2 — Roots of Tirunelveli**: Thamirabarani heritage, complex seating puzzle (*Secret Word: DREAM*).
   - **Chapter 3 — The Sky Was Never the Limit**: Tactical Caesar cipher frequency analysis (*Secret Word: FLIGHT*).
   - **Chapter 4 — A Mind Full of Possibilities**: Altitude vector sequence mathematical puzzle (*Secret Word: STRENGTH*).
   - **Chapter 5 — A Taste of Her World**: Spicy food appreciation & coordinate cipher (*Secret Word: INSPIRE*).
   - **Chapter 6 — Memories & Flight Schedule**: Fighter squadron scheduling logic challenge (*Secret Word: ADMIRE*).
   - **Chapter 7 — The Final Takeoff**: Culmination story, interactive Dark Chocolate bar, aerogramme letter, celebratory starburst, and Squadron Log with direct email wish transmission.

3. **Gate 2 — Private Memory Vault Security**
   - Mechanical iris / camera aperture security lock with independent secondary 8-digit PIN clearance.

4. **Private Photo Memories Gallery**
   - Cinematic photo presentation with rounded luxury borders and aspect-ratio preservation.
   - Horizontal thumbnail filmstrip carousel with auto-centering.
   - In-browser and server-backed photo uploads with captions, slideshow playback, and full-screen view.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env` if you wish to configure local Nodemailer SMTP forwarding:
```bash
cp .env.example .env
```

### 3. Launch Server
```bash
npm start
```
Visit **http://localhost:3000** in your browser.

---

## 🛡️ Security Note
All sensitive clearance PINs and puzzle solution validations are handled via salted cryptographic hashes (`crypto.createHash('sha256')`) and timing-safe comparisons to prevent unauthorized bypass.
