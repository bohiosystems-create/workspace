# The Excel engine: setup

The app recalculates uploaded workbooks in the browser. When that engine cannot reproduce a workbook (a function it does not have, a
construction it cannot follow), it asks a server engine. With this setup the first server engine is **Microsoft Excel itself**, reached
through Microsoft 365 (Microsoft Graph): nobody opens Excel, the server does it in the background. LibreOffice (lo-service/) stays as the
second engine. Either is used for a workbook only when it reproduces at least 99% of the results Excel saved in the file, and every
answer names the engine that computed it.

## What happens to a workbook

1. The server copies it into one SharePoint folder, named by its SHA-256 (no client or file name in the folder).
2. It opens the copy in an Excel session that **saves nothing** (`persistChanges: false`), sets the cells of the what-if, asks Excel
   for a full recalculation, reads the results and closes the session.
3. Copies are deleted after 24 hours (`XL_KEEP_HOURS` to change it). Macros never run (Excel for the web does not run VBA).

## Steps (Microsoft 365 administrator, about 30 minutes)

Decide first whose Microsoft 365 this is. For a client pilot use the **client's own tenant**, so their models stay in it. For the demo,
Bohio's tenant.

1. **Subscription**: a business plan with SharePoint Online (Microsoft 365 Business Standard, E3 or similar).
2. **Data location**: Microsoft 365 admin centre → Settings → Org settings → Organization profile → *Data location*. If the models must
   stay in Saudi Arabia, confirm the location with Microsoft before going further.
3. **SharePoint site and folder**: create a site, e.g. *Bohio Calc* (`https://<tenant>.sharepoint.com/sites/calc`), private, no members
   needed. In its Documents library create a folder *Bohio Calc*.
4. **App registration**: entra.microsoft.com → App registrations → New registration → name *Bohio Excel Calc*, accounts in this
   organisation only. Note the *Application (client) ID* and the *Directory (tenant) ID*.
   (If the tenant already has the app used for Outlook, the same app can be used: add the permission below to it.)
5. **Permission, one site only**: API permissions → Add → Microsoft Graph → *Application permissions* → **Sites.Selected** → Grant admin
   consent. Then give the app write access to that site alone (Graph Explorer, signed in as an administrator with Sites.FullControl.All):
   ```
   GET  https://graph.microsoft.com/v1.0/sites/<tenant>.sharepoint.com:/sites/calc?$select=id      → the site id
   POST https://graph.microsoft.com/v1.0/sites/<site id>/permissions
        {"roles":["write"],"grantedToIdentities":[{"application":{"id":"<client id>","displayName":"Bohio Excel Calc"}}]}
   ```
   (Files.ReadWrite.All also works but opens every file in the company: not recommended.)
6. **Credential**: Certificates & secrets → New client secret (note its expiry; a certificate is better for production).
7. **Vercel** (each project that should use it, e.g. `jadwa`, `kinan-estatemaster`) → Settings → Environment Variables:
   | Name | Value |
   |---|---|
   | `MS_TENANT_ID` | the tenant id |
   | `MS_CLIENT_ID` | the application (client) id |
   | `MS_CLIENT_SECRET` | the secret |
   | `XL_FOLDER` | `/sites/<tenant>.sharepoint.com:/sites/calc:/drive/root:/Bohio Calc` |
   Then redeploy. **Never paste the secret into a chat or an email.**
8. **Check**: open the app → Settings → System check: *Excel engine — Microsoft Excel answers*.

## If Excel refuses the app on its own

Microsoft has at times required a signed-in user for some Excel calls. If the system check shows the Excel engine set up but not
answering with an access error, use a service account instead: a licensed user (e.g. `calc@<tenant>`) with access to the folder, a
delegated permission *Files.ReadWrite.All* on the app, one sign-in to obtain a refresh token, and `XL_REFRESH_TOKEN` set in Vercel. The
server then acts as that user.

## Limits to know

- One recalculation takes seconds: Excel checks and answers single what-ifs, goal-seek steps and samples; long runs (a 500-run Monte
  Carlo, a large grid) stay on the browser engine where it reproduces the workbook.
- Not run by any online engine: VBA macros, Power Query refreshes, links to other workbooks, add-in functions (Bloomberg, FactSet). Their
  saved values are used and the answer says so.
- Files over 60 MB are refused; `.xls` and `.xlsb` need converting to `.xlsx` first.

## Test

`node tests/t_xl.cjs` (the server against a stand-in for Microsoft's sign-in and Excel) and `tests/t_xlengine.mjs` (the page: Excel first,
LibreOffice next, each only when it reproduces the workbook).
