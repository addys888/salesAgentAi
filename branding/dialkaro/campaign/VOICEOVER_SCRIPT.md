# DialKaro — 6 Individual Voiceover Scripts (10 sec each)

> **Each script = ~25 words = exactly 10 seconds at natural pace**
> **Generate each separately** on [ttsmaker.com](https://ttsmaker.com) → download as MP3
> **Voice**: English (India) – Male Professional
> **Speed**: 1.0x

---

## Clip 1 — Excel Upload & Auto-Dial
**File**: `video-clips/clip1.mp4`
**Snapshot ref**: `snapshots/01_hero_dialer.png`

### Voiceover text (copy-paste into TTS):
```
Your sales reps waste sixty percent of their day not selling.
DialKaro fixes that.
Upload any Excel — your leads are ready to dial in seconds.
```

### Save audio as: `video-clips/vo1.mp3`

---

## Clip 2 — One-Click WhatsApp + Phone
**File**: `video-clips/clip2.mp4`
**Snapshot ref**: `snapshots/01_hero_dialer.png`

### Voiceover text:
```
One click — phone call.
One click — WhatsApp, message pre-filled.
No copy-paste. No switching apps. Just dial and go.
```

### Save audio as: `video-clips/vo2.mp3`

---

## Clip 3 — Callback Follow-Up Scheduling
**File**: `video-clips/clip3.mp4`
**Snapshot ref**: `snapshots/02_callback_followup.png`

### Voiceover text:
```
Lead says call me back Thursday?
DialKaro schedules it automatically.
A reminder pops up at the right time. No lead falls through the cracks.
```

### Save audio as: `video-clips/vo3.mp3`

---

## Clip 4 — AI Session Summaries
**File**: `video-clips/clip4.mp4`
**Snapshot ref**: `snapshots/05_ai_summary.png`

### Voiceover text:
```
End of session — AI writes your report.
Who was interested. Who to chase tomorrow. What to skip.
Sent to your manager, automatically.
```

### Save audio as: `video-clips/vo4.mp3`

---

## Clip 5 — Web-to-Lead Webhooks
**File**: `video-clips/clip5.mp4`
**Snapshot ref**: `snapshots/04_webhook_leads.png`

### Voiceover text:
```
Facebook Ads, website forms, IndiaMART —
leads flow in through a webhook and get assigned to the right rep
by specialty. Zero manual work.
```

### Save audio as: `video-clips/vo5.mp3`

---

## Clip 6 — Admin Dashboard & Analytics
**File**: `video-clips/clip6.mp4`
**Snapshot ref**: `snapshots/06_admin_dashboard.png`

### Voiceover text:
```
Real-time analytics. Team leaderboard. Total visibility.
DialKaro — three times more calls per day.
Built for Indian sales teams. Try it free today.
```

### Save audio as: `video-clips/vo6.mp3`

---

## How to Generate All 6 Voiceovers

### Option A: TTSMaker (Free, No Signup)

1. Open [ttsmaker.com](https://ttsmaker.com)
2. Paste Clip 1 voiceover text
3. Select voice: **English (India) - Male** or **Neural English Male**
4. Speed: **1.0x**
5. Click **Start** → wait → click **Download MP3**
6. Save as `vo1.mp3` in `video-clips/`
7. Repeat for all 6 clips

### Option B: ElevenLabs (Best Quality, 10 min free)

1. Go to [elevenlabs.io](https://elevenlabs.io)
2. Sign up (free — 10 min of audio/month, you need ~1 min total)
3. Choose voice: **"Raj"** or **"Adam"** (professional)
4. Paste each clip text → Generate → Download
5. Save as `vo1.mp3` through `vo6.mp3`

---

## After Generating — Your Folder Should Look Like:

```
video-clips/
├── clip1.mp4     ← Luma clip: Excel Upload
├── clip2.mp4     ← Luma clip: One-Click Dial
├── clip3.mp4     ← Luma clip: Callback
├── clip4.mp4     ← Luma clip: AI Summary
├── clip5.mp4     ← Luma clip: Webhooks
├── clip6.mp4     ← Luma clip: Dashboard
├── vo1.mp3       ← Voiceover for clip 1
├── vo2.mp3       ← Voiceover for clip 2
├── vo3.mp3       ← Voiceover for clip 3
├── vo4.mp3       ← Voiceover for clip 4
├── vo5.mp3       ← Voiceover for clip 5
└── vo6.mp3       ← Voiceover for clip 6
```

Then run: `bash merge_video.sh` — it will combine everything into `dialkaro_final_demo.mp4`
