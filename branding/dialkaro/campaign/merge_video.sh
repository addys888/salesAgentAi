#!/bin/bash
# ═══════════════════════════════════════════════════
#  DialKaro — Merge 6 Clips + Voiceover into Final Video
# ═══════════════════════════════════════════════════
#
#  USAGE:
#    1. Put your 6 Luma clips in the video-clips/ folder
#       Name them: clip1.mp4, clip2.mp4, ... clip6.mp4
#
#    2. Put your voiceover MP3 in this folder
#       Name it: voiceover.mp3
#
#    3. Run:  bash merge_video.sh
#
# ═══════════════════════════════════════════════════

CLIPS_DIR="video-clips"
VOICEOVER="voiceover.mp3"
OUTPUT="dialkaro_final_demo.mp4"
MERGED_VIDEO="video-clips/_merged_no_audio.mp4"

echo ""
echo "═══════════════════════════════════════"
echo "  🎬 DialKaro Video Merge Tool"
echo "═══════════════════════════════════════"
echo ""

# Check ffmpeg
if ! command -v ffmpeg &> /dev/null; then
  echo "❌ ffmpeg not installed. Run: brew install ffmpeg"
  exit 1
fi

# ─── Step 1: Find and list clips ───
echo "📁 Scanning $CLIPS_DIR/ for clips..."
echo ""

CLIP_COUNT=0
CLIP_LIST=""

for i in 1 2 3 4 5 6; do
  CLIP="$CLIPS_DIR/clip${i}.mp4"
  if [ -f "$CLIP" ]; then
    DUR=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CLIP" 2>/dev/null)
    echo "  ✅ clip${i}.mp4  (${DUR}s)"
    CLIP_COUNT=$((CLIP_COUNT + 1))
    CLIP_LIST="$CLIP_LIST|$CLIP"
  else
    echo "  ⚠️  clip${i}.mp4  — NOT FOUND"
  fi
done

echo ""

if [ $CLIP_COUNT -eq 0 ]; then
  echo "❌ No clips found in $CLIPS_DIR/"
  echo ""
  echo "📋 Instructions:"
  echo "   1. Copy your 6 Luma clips into: $CLIPS_DIR/"
  echo "   2. Rename them: clip1.mp4, clip2.mp4, clip3.mp4, clip4.mp4, clip5.mp4, clip6.mp4"
  echo "   3. Run this script again"
  echo ""
  
  # Try to auto-detect any MP4s in the folder
  OTHER_CLIPS=$(find "$CLIPS_DIR" -name "*.mp4" 2>/dev/null | head -10)
  if [ -n "$OTHER_CLIPS" ]; then
    echo "   Found these files in $CLIPS_DIR/ — rename them to clip1.mp4 etc.:"
    echo "$OTHER_CLIPS" | while read f; do echo "     $(basename "$f")"; done
  fi
  exit 1
fi

echo "📊 Found $CLIP_COUNT clips"

# ─── Step 2: Concatenate all clips ───
echo ""
echo "🔗 Step 1/3: Concatenating $CLIP_COUNT clips..."

# Create concat file list
CONCAT_FILE="$CLIPS_DIR/_concat_list.txt"
> "$CONCAT_FILE"
for i in 1 2 3 4 5 6; do
  CLIP="$CLIPS_DIR/clip${i}.mp4"
  if [ -f "$CLIP" ]; then
    echo "file '../$CLIP'" >> "$CONCAT_FILE"
  fi
done

# First normalize all clips to same resolution and codec
echo "   Normalizing clips to 1920x1080..."
for i in 1 2 3 4 5 6; do
  CLIP="$CLIPS_DIR/clip${i}.mp4"
  NORM="$CLIPS_DIR/_norm_clip${i}.mp4"
  if [ -f "$CLIP" ]; then
    ffmpeg -y -i "$CLIP" \
      -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
      -c:v libx264 -preset fast -crf 18 \
      -an \
      -r 30 \
      "$NORM" 2>/dev/null
  fi
done

# Create concat list for normalized clips
NORM_CONCAT="$CLIPS_DIR/_norm_concat.txt"
> "$NORM_CONCAT"
for i in 1 2 3 4 5 6; do
  NORM="$CLIPS_DIR/_norm_clip${i}.mp4"
  if [ -f "$NORM" ]; then
    echo "file '$(basename $NORM)'" >> "$NORM_CONCAT"
  fi
done

# Concatenate
ffmpeg -y -f concat -safe 0 -i "$NORM_CONCAT" \
  -c copy \
  "$MERGED_VIDEO" 2>/dev/null

if [ ! -f "$MERGED_VIDEO" ]; then
  echo "   ❌ Concatenation failed"
  exit 1
fi

MERGED_DUR=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$MERGED_VIDEO")
echo "   ✅ Merged: ${MERGED_DUR}s"

# ─── Step 3: Add voiceover ───
if [ -f "$VOICEOVER" ]; then
  VO_DUR=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VOICEOVER")
  echo ""
  echo "🎙️  Step 2/3: Adding voiceover (${VO_DUR}s)..."
  
  ffmpeg -y -i "$MERGED_VIDEO" -i "$VOICEOVER" \
    -map 0:v -map 1:a \
    -c:v copy \
    -c:a aac -b:a 192k \
    -shortest \
    "$OUTPUT" 2>/dev/null
  
  if [ $? -eq 0 ]; then
    echo "   ✅ Voiceover added"
  else
    echo "   ⚠️  Voiceover merge failed — outputting video without audio"
    cp "$MERGED_VIDEO" "$OUTPUT"
  fi
else
  echo ""
  echo "🎙️  Step 2/3: No voiceover.mp3 found — outputting video without voiceover"
  cp "$MERGED_VIDEO" "$OUTPUT"
fi

# ─── Step 4: Cleanup temp files ───
echo ""
echo "🧹 Step 3/3: Cleaning up temp files..."
rm -f "$CLIPS_DIR"/_norm_clip*.mp4
rm -f "$CLIPS_DIR"/_concat_list.txt
rm -f "$CLIPS_DIR"/_norm_concat.txt
rm -f "$MERGED_VIDEO"
echo "   ✅ Done"

# ─── Final output ───
if [ -f "$OUTPUT" ]; then
  FINAL_SIZE=$(du -h "$OUTPUT" | awk '{print $1}')
  FINAL_DUR=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT")
  echo ""
  echo "═══════════════════════════════════════"
  echo "  ✅ FINAL VIDEO READY!"
  echo "═══════════════════════════════════════"
  echo ""
  echo "  📹 File:     $OUTPUT"
  echo "  ⏱️  Duration: ${FINAL_DUR}s"
  echo "  📦 Size:     ${FINAL_SIZE}"
  echo ""
  echo "  ▶️  Open: open \"$OUTPUT\""
  echo ""
else
  echo ""
  echo "  ❌ Something went wrong. Check your input files."
fi
