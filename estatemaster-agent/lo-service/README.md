# Second formula engine (LibreOffice)

The app recalculates uploaded workbooks in the browser. When that engine cannot reproduce a workbook's own stored results
(a function it does not have, such as FREQUENCY or LAMBDA, or a construction it cannot follow), the app asks this service: LibreOffice
recalculates the same workbook and, if it reproduces at least 99% of Excel's stored results, it answers that workbook's figures
(each answer says so). Otherwise the figures stay "not computed".

## What is sent
The workbook file (once per session; later calls send its hash), the cells to set and the cells to read. Nothing is kept on disk;
up to `LO_CACHE` workbooks stay in memory for speed. Macros never run.

## Deploy (Google Cloud Run, Dammam region, for KSA data residency)
```
gcloud run deploy bohio-lo --source lo-service --region me-central2 --memory 2Gi --cpu 2 --timeout 120 \
  --concurrency 1 --min-instances 0 --max-instances 4 --allow-unauthenticated \
  --set-env-vars LO_TOKEN=<a long random secret>
```
The service checks its own bearer key on every call (`LO_TOKEN`), so it can be reached publicly only with that key.
Then in each Vercel project that should use it (e.g. `jadwa`, `kinan-estatemaster`): `LO_URL` = the service URL, `LO_TOKEN` = the same
secret, and redeploy. Settings → System check then shows "Server engine".

## Local test
`LO_TOKEN=test python3 server.py` (needs LibreOffice and python3-uno), then POST /recalc as in server.py.
