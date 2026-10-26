#!/usr/bin/env python3
"""Turn one or more room clips (same image, same framing) into the title-screen loop.

    python3 room_loop.py OUTDIR clip1.mp4 [clip2.mp4 ...]

Writes OUTDIR/zen-room.mp4 (H.264, plays everywhere), zen-room.webm (VP9 fallback), zen-room.jpg (poster =
first frame) and zen-room.mp3 (the clips' own sound, joined). Clips are joined with 1.5 s video crossfades and
2.5 s sound crossfades; the end of the last clip fades into the start of the first, so the picture loops with
no seam. The game loops the sound itself with its own crossfade, so the mp3 only needs the joins in between.
Needs ffmpeg with libx264, libvpx-vp9 and libmp3lame.
"""
import json, subprocess, sys

XV, XA, SKIP = 1.5, 2.5, 0.5          # video crossfade, sound crossfade, seconds dropped from each clip's start


def dur(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path],
                         check=True, capture_output=True, text=True).stdout
    return float(json.loads(out)['format']['duration'])


def has_audio(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path],
                         check=True, capture_output=True, text=True).stdout
    return bool(out.strip())


def run(args):
    print(' '.join(args[:6]), '...', flush=True)
    subprocess.run(args, check=True)


def main(out, clips):
    lens = [dur(c) - SKIP for c in clips]
    ins = sum((['-i', c] for c in clips), [])
    # picture: every clip to 8-bit 1080x1920, crossfaded in order, then the end faded into the start
    f, t = [], 0.0
    for i in range(len(clips)):
        f.append(f'[{i}:v]trim=start={SKIP},setpts=PTS-STARTPTS,scale=1080:1920:flags=accurate_rnd:sws_dither=ed,fps=24,format=yuv420p[v{i}]')
    cur, t = 'v0', lens[0]
    for i in range(1, len(clips)):
        t -= XV
        f.append(f'[{cur}][v{i}]xfade=transition=fade:duration={XV}:offset={t:.3f}[j{i}]')
        cur, t = f'j{i}', t + lens[i]
    f.append(f'[{cur}]split[a][b];[b]trim=0:{XV},setpts=PTS-STARTPTS[head]')
    f.append(f'[a][head]xfade=transition=fade:duration={XV}:offset={t - XV:.3f}[o];[o]trim=start={XV},setpts=PTS-STARTPTS[v]')
    run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(f), '-map', '[v]', '-an',
         '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart', f'{out}/zen-room.mp4'])
    run(['ffmpeg', '-v', 'error', '-y', '-i', f'{out}/zen-room.mp4', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36',
         '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', f'{out}/zen-room.webm'])
    run(['ffmpeg', '-v', 'error', '-y', '-i', f'{out}/zen-room.mp4', '-frames:v', '1', '-q:v', '3', f'{out}/zen-room.jpg'])
    # sound: the clips' own soundtracks, crossfaded in order and levelled quiet
    with_sound = [i for i, c in enumerate(clips) if has_audio(c)]
    if not with_sound:
        print('no sound in the clips: zen-room.mp3 left as it is'); return
    f = [f'[{i}:a]atrim=start={SKIP + 0.5},asetpts=PTS-STARTPTS,aresample=44100[a{i}]' for i in with_sound]
    cur = f'a{with_sound[0]}'
    for k, i in enumerate(with_sound[1:], 1):
        f.append(f'[{cur}][a{i}]acrossfade=d={XA}:c1=qsin:c2=qsin[s{k}]'); cur = f's{k}'
    f.append(f'[{cur}]loudnorm=I=-24:TP=-3:LRA=11,aresample=44100[out]')
    run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(f), '-map', '[out]', '-ar', '44100',
         '-c:a', 'libmp3lame', '-q:a', '4', f'{out}/zen-room.mp3'])


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
