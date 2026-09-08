BOHIO CONTRACTOR PLATFORM - VERCEL PACK

Deploy with the Vercel dashboard
1. Unzip bohio-vercel.zip.
2. Add the unzipped folder to a GitHub repository.
3. In Vercel, choose Add New > Project and import that repository.
4. Leave Framework Preset as Other and Build Command empty.
5. Deploy.

Deploy with the Vercel CLI
1. Unzip bohio-vercel.zip.
2. Open a terminal in the unzipped folder.
3. Run: vercel
4. For a production deployment, run: vercel --prod

The pack includes both interfaces, the interactive 3D worksite, Dallas Light font,
the contractor report PDFs, and the /portal shortcut.

The demo stores changes in each browser's localStorage. API keys entered in the
chat settings remain in that browser and are not bundled in this pack.

Current demo navigation: Project Overview, Orchestration Agent, Contractor Portal.
API configuration is shared by both interfaces on the same browser/origin.
Outlook opens a prepared draft; live automatic email sending is not configured.
Primavera updates and prior-client history are illustrative demo data.
Cross-device chat needs a shared backend. Scanner intake accepts files/camera
output; it does not directly control a desktop scanner. Uploaded PDFs can be
viewed, but their text is not yet extracted for AI analysis.
REAL WHATSAPP PHONE DEMO

1. Deploy this folder to Vercel.
2. Create an Upstash Redis database and add its REST URL and token as Vercel environment variables.
3. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PUBLIC_BASE_URL and OPENAI_API_KEY from .env.example.
4. Redeploy after adding environment variables.
5. In Twilio Console > Messaging > Try it out > Send a WhatsApp message > Sandbox settings, set "When a message comes in" to:
   https://YOUR-PROJECT.vercel.app/api/whatsapp
   Method: HTTP POST
6. On your phone, scan the Twilio Sandbox QR code or send its displayed "join ..." message.
7. Send a text, site photo, or WhatsApp voice note. Keep the Bohio Orchestration > Contractor input tab open to see the live timeline update.

Voice notes are transcribed through the OpenAI API. Site images are interpreted through the OpenAI vision input and the original image or audio is retained in the Bohio evidence vault for seven days by default. The evidence, transcript and image findings are linked to the Primavera audit entry after the matched deliverable is verified.

WHATSAPP AGENT COMMANDS

Text any of these to the agent (no photo attached) and it replies in the chat:
   schedule            - the full project programme, dates, status and milestones
   schedule voltaic     - the schedule filtered to one contractor
   checklist            - a site-inspection checklist built from the deliverable
                          acceptance criteria plus standard HSE items
   status               - a progress summary (packages complete, weighted average)
   help / menu          - what the agent understands
Long replies are split into several WhatsApp messages automatically. Any message
that carries a photo or voice note is always treated as site evidence, never a
command, and a proposed finish date is routed to the planner for approval.

For one-phone demos, DEFAULT_CONTRACTOR=voltaic maps all messages to Voltaic Power Systems. For multiple phones, set CONTRACTOR_PHONE_MAP as shown in .env.example.

Progress updates sync automatically in the demo. Proposed start/finish dates remain pending until planner approval.
