# news-package: erase the "LEMO" letters from the top-right channel tab and the lower-third tag, cut before the end card.
import subprocess, sys, numpy as np
src, dst, end = 'web/news-package.mp4', 'web-trimmed/news-package.mp4', 47.5
W, H = 1280, 720
fps = subprocess.run(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=r_frame_rate','-of','csv=p=0',src],capture_output=True,text=True).stdout.strip().split()[0].rstrip(',')
dec = subprocess.Popen(['ffmpeg','-v','error','-i',src,'-t',str(end),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',fps,'-i','-','-i',src,'-t',str(end),
    '-map','0:v','-map','1:a','-vf',f'fade=t=out:st={end-0.6}:d=0.6','-af',f'afade=t=out:st={end-0.6}:d=0.6',
    '-c:v','libx264','-preset','slow','-crf','23','-pix_fmt','yuv420p','-profile:v','high','-movflags','+faststart','-c:a','aac','-b:a','128k',dst],stdin=subprocess.PIPE)
def yellow(a): return (a[...,0]>150)&(a[...,1]>120)&(a[...,2]<130)&(a[...,0].astype(int)-a[...,2]>70)
n=0
while True:
    b = dec.stdout.read(W*H*3)
    if len(b) < W*H*3: break
    f = np.frombuffer(b, np.uint8).reshape(H, W, 3).copy()
    # top-right tab: yellow parallelogram with dark letters -> fill the letters with the tab's yellow
    badge = f[38:76, 1102:1226]
    if yellow(badge).mean() > 0.3:
        top, bot = f[40, 1126:1201].astype(float), f[73, 1126:1201].astype(float)   # rows just inside the tab, above and below the letters
        k = np.linspace(0, 1, 34)[1:-1, None, None]
        f[41:73, 1126:1201] = (top[None] * (1 - k) + bot[None] * k).astype(np.uint8)
    # lower third: dark tag with yellow letters -> fill the letters with the tag's dark
    box = f[617:656, 902:975]; y = yellow(box) | (box.max(axis=2) > 90)
    if (yellow(box)).sum() > 40:
        box[:] = np.median(box[~y], axis=0).astype(np.uint8)
    enc.stdin.write(f.tobytes()); n+=1
enc.stdin.close(); enc.wait(); print('frames', n)
