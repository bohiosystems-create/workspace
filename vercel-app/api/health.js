/* A deployment probe with no dependencies and no environment variables.
 *
 * It exists to split one ambiguous symptom — "I get a 404" — into three
 * distinguishable cases, because the fix is different for each:
 *
 *   /api/health 404      the api/ folder is not at the deployment root, or
 *                        the project is building into an output directory
 *                        that does not contain it. A settings problem.
 *   /api/health 200,
 *     but / is 404       the functions deployed and the static files did not.
 *                        Output Directory is the usual cause.
 *   both 200             routing is fine; any remaining 404 is a specific
 *                        path, not the deployment.
 *
 * It deliberately reports which integrations are configured without ever
 * revealing a value, so it is safe to curl and safe to paste into a ticket.
 */
module.exports = function handler(req, res) {
  const has = (name) => Boolean(process.env[name] && String(process.env[name]).trim());
  res.status(200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(JSON.stringify({
    ok: true,
    service: 'bohio',
    node: process.version,
    time: new Date().toISOString(),
    /* true means the variable is set, never what it is set to */
    configured: {
      monday: has('MONDAY_API_TOKEN') && has('MONDAY_BOARD_ID'),
      mondayStatusColumn: has('MONDAY_STATUS_COLUMN'),
      mondayDateColumn: has('MONDAY_DATE_COLUMN'),
      mondayWebhookSecret: has('MONDAY_WEBHOOK_SECRET'),
      twilio: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN'),
      openai: has('OPENAI_API_KEY'),
      redis: has('UPSTASH_REDIS_REST_URL') && has('UPSTASH_REDIS_REST_TOKEN'),
      publicBaseUrl: has('PUBLIC_BASE_URL')
    }
  }, null, 2));
};
