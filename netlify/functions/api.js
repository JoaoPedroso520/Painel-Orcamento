const serverless = require("serverless-http");
const { app } = require("../../server");

const handler = serverless(app);
const FUNCTION_PREFIX = "/.netlify/functions/api";

exports.handler = (event, context) => {
  const originalPath = event.path || "";
  let path = originalPath.startsWith(FUNCTION_PREFIX)
    ? originalPath.slice(FUNCTION_PREFIX.length)
    : originalPath;

  if (!path.startsWith("/api")) {
    path = `/api${path.startsWith("/") ? path : `/${path}`}`;
  }

  return handler(
    {
      ...event,
      path,
      rawPath: path
    },
    context
  );
};
