// =============================================================
// Shared auth + validation middleware stub
// TODO(Person 1): Replace mock user resolution with real JWT.
// =============================================================

const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

// --- Mock auth: fakes a req.user so endpoints can be tested ---
// For real tests, send an `x-mock-role` header (patient|doctor|pharmacist|rider|admin)
// and optionally `x-mock-user-id` (integer). Defaults to a patient.
function auth(req, _res, next) {
  const role = (req.headers['x-mock-role'] || 'patient').toUpperCase();
  const id = parseInt(req.headers['x-mock-user-id'] || '1', 10);
  req.user = {
    id: isNaN(id) ? 1 : id,
    role,
    email: `mock-${role.toLowerCase()}-${id}@medireach.test`,
    firstName: 'Mock',
    lastName: role,
  };
  next();
}

function requireRole(...allowedRoles) {
  const upper = allowedRoles.map((r) => r.toUpperCase());
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'UNAUTHENTICATED', 'You need to sign in first.'));
    }
    if (!upper.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          'FORBIDDEN',
          "You don't have permission to do that. If you think this is a mistake, please ask a family member or call support."
        )
      );
    }
    next();
  };
}

function validate({ body: bodySchema, params: paramsSchema, query: querySchema }) {
  return (req, _res, next) => {
    try {
      if (bodySchema) req.body = bodySchema.parse(req.body);
      if (paramsSchema) req.params = paramsSchema.parse(req.params);
      if (querySchema) req.query = querySchema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        const path = firstIssue.path.join('.') || 'field';
        next(new ApiError(400, 'VALIDATION_ERROR', `${path}: ${firstIssue.message}`));
      } else {
        next(err);
      }
    }
  };
}

module.exports = { auth, requireRole, validate };
