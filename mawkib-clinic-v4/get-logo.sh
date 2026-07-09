#!/data/data/com.termux/files/usr/bin/sh
# One-time (needs internet): downloads the AEI Telehealth logo into public/logo.png
cd "$(dirname "$0")"
curl -L -o public/logo.png "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=768,fit=crop/mjEqb1pDVyivLVZW/aei-telehealth-clinic_horizontal-dJobBeypvpse9p19.png" \
  && echo "Logo saved to public/logo.png" || echo "Download failed - save the logo from aeitelehealth.org as public/logo.png manually"
