# `/items` server timing

Server timing logs are disabled by default. Set the server-only environment
variable `PERFORMANCE_LOGS_ENABLED=true` on a Vercel Preview deployment to
enable them, then make an authenticated request to `/items`. Remove or set the
variable to `false` after collecting a short sample. Do not add it with a
`NEXT_PUBLIC_` prefix.

Each record is a JSON line with the `server_performance` type. When the proxy is
active, a random per-request ID correlates proxy and page logs. Records contain
no user identifier, cookie, token, query result, image path, or signed URL.

The local production build generated an empty Next.js proxy/middleware
manifest, and its `/items` request emitted page timings but no proxy timing or
request ID. The repository currently places `proxy.ts` at the root while the
App Router is under `src/app`; Next.js expects the proxy alongside the app
directory. I did not relocate it because that would activate existing
authentication behavior and change request handling. Confirm whether the
deployed build has a proxy entry before relying on proxy timing; wiring it up
should be reviewed as a separate authentication behavior change.

## Events

- `move_plan.request_total`: total generation API elapsed time.
- `move_plan.source_load` and `move_plan.source_recheck`: initial source query
  and the consistency check before saving.
- `move_plan.generation_claim` and `move_plan.save_result`: database RPCs for
  cache/claim handling and persistence.
- `move_plan.ai_generation`: external text-model request and response; compare
  this directly with `move_plan.request_total` to see whether model latency
  dominates.
- `move_plan.prompt_prepared`: safe prompt size and item count only; prompt
  contents are never logged.
- `items.proxy.session_verification`: proxy session verification, including
  Supabase `getClaims()`.
- `items.auth.client_setup` and `items.auth.get_user`: page authentication
  client setup and the Supabase `getUser()` request, respectively.
- `items.auth.require_page_user`: total `requirePageUser()` elapsed time,
  including setup and authentication.
- `items.supabase.client_for_queries`: creation of the page query client.
- `items.db.*`: individual database query durations.
- `items.db.parallel_query_group`: total wall-clock duration of the four
  concurrent database queries. Individual query events overlap and should not
  be added together.
- `items.storage.signed_urls`: batch Storage signed-URL request.
- `items.data_mapping_elapsed` and `items.item_view_model_elapsed`: local
  synchronous data preparation intervals.
- `items.data_preparation_completed`: page data preparation elapsed time,
  including the awaited remote operations.
- `items.response_completed`: elapsed time from page entry until the Next.js
  `after()` callback. This is an end-to-end server elapsed measurement, not an
  isolated React rendering CPU measurement.

`status: "resolved"` means the measured promise resolved; Supabase APIs may
return an `{ error }` value without rejecting, so consult the page's normal
error logs for query outcomes. `node_process_uptime_ms` is emitted as a process
age clue only. It cannot prove whether a request was a cold start. Use Vercel
Function invocation/cold-start data to distinguish cold and warm requests.

## Collecting production-side evidence

1. In Vercel, set `PERFORMANCE_LOGS_ENABLED=true` for Preview only and create a
   Preview deployment. Do not deploy from this investigation.
2. In Vercel Runtime Logs, filter for `server_performance` and `/items`
   related events. Capture several consecutive authenticated requests and
   compare proxy, auth, each query, storage, parallel-group, preparation, and
   response durations. Preserve matching `request_id` values when comparing
   events.
3. In Chrome DevTools Network, record the document request's start time, TTFB,
   and total time for those same requests. Compare a first request after an idle
   period with subsequent warm requests. Function logs are required to
   attribute cold starts; process uptime alone is insufficient.
4. Check Vercel **Project Settings → Functions → Function Region** (or the
   `vercel_region` field in these records) and Supabase **Project Settings →
   General → Region**. This repository does not declare a Vercel function
   region, and a Supabase URL does not establish its project region.
5. Disable the variable after the sample. Do not share raw auth headers,
   cookies, signed URLs, or user-specific query data when sharing logs.
