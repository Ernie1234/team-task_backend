import client from "prom-client";

/*
 * Prometheus metrics, served at GET /metrics. Process metrics (CPU, memory,
 * event-loop lag, GC) plus the app's own: HTTP traffic, sockets, live notes,
 * background jobs and emails.
 */

export const registry = new client.Registry();
registry.setDefaultLabels({ service: "team-task-api" });
client.collectDefaultMetrics({ register: registry, prefix: "teamtask_" });

const httpRequests = new client.Counter({
  name: "teamtask_http_requests_total",
  help: "HTTP requests by method, route pattern and status code",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

const httpDuration = new client.Histogram({
  name: "teamtask_http_request_duration_seconds",
  help: "HTTP request duration by method, route pattern and status class",
  labelNames: ["method", "route", "status_class"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const recordHttp = (method: string, route: string, status: number, seconds: number) => {
  httpRequests.inc({ method, route, status: String(status) });
  httpDuration.observe({ method, route, status_class: `${Math.floor(status / 100)}xx` }, seconds);
};

const jobDuration = new client.Histogram({
  name: "teamtask_job_duration_seconds",
  help: "Background job run time",
  labelNames: ["job"] as const,
  buckets: [0.05, 0.1, 0.5, 1, 5, 15, 60],
  registers: [registry],
});

const jobFailures = new client.Counter({
  name: "teamtask_job_failures_total",
  help: "Background job runs that threw",
  labelNames: ["job"] as const,
  registers: [registry],
});

/** Times a background job run and counts failures (rethrows) */
export const trackJob = async <T>(job: string, run: () => Promise<T>): Promise<T> => {
  const end = jobDuration.startTimer({ job });
  try {
    return await run();
  } catch (error) {
    jobFailures.inc({ job });
    throw error;
  } finally {
    end();
  }
};

export const emailsSent = new client.Counter({
  name: "teamtask_emails_sent_total",
  help: "Emails handed to the mail provider",
  labelNames: ["kind"] as const,
  registers: [registry],
});

export const emailFailures = new client.Counter({
  name: "teamtask_email_failures_total",
  help: "Emails that couldn't be sent",
  labelNames: ["kind"] as const,
  registers: [registry],
});

/** Values read when /metrics is scraped (sockets, live notes, database) */
export const registerGauge = (name: string, help: string, read: () => number) =>
  new client.Gauge({
    name,
    help,
    registers: [registry],
    collect() {
      this.set(read());
    },
  });
