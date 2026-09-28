# ytpp-ui
Next.js front end for the yt-performance-predictor API.

    cp .env.example .env.local   # set API_URL to your VM's HTTPS address
    npm install && npm run dev   # http://localhost:3000

Deploy: import the repo in Vercel and add the env var API_URL (Settings > Environment Variables).
The browser only talks to /api/predict on Vercel, which forwards to the VM.
