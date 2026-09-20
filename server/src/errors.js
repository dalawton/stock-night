export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}