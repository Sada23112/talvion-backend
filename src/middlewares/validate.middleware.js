/**
 * Generic request validation middleware.
 * @param {Object} schema Object containing validation rules for req.body or req.query
 */
const validate = (schema = {}) => {
  return (req, res, next) => {
    const data = req.body || {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // 1. Required Check
      if (rules.required && (value === undefined || value === null || value === '')) {
        const error = new Error(`Field '${field}' is required.`);
        error.statusCode = 400;
        return next(error);
      }

      if (value !== undefined && value !== null && value !== '') {
        // 2. Type Check
        if (rules.type && typeof value !== rules.type) {
          const error = new Error(`Field '${field}' must be of type '${rules.type}'.`);
          error.statusCode = 400;
          return next(error);
        }

        // 3. String length constraints
        if (rules.type === 'string') {
          if (rules.minLength && value.length < rules.minLength) {
            const error = new Error(`Field '${field}' must be at least ${rules.minLength} characters.`);
            error.statusCode = 400;
            return next(error);
          }
          if (rules.maxLength && value.length > rules.maxLength) {
            const error = new Error(`Field '${field}' cannot exceed ${rules.maxLength} characters.`);
            error.statusCode = 400;
            return next(error);
          }
        }

        // 4. Regex Pattern Check
        if (rules.pattern && !rules.pattern.test(value)) {
          const error = new Error(rules.message || `Field '${field}' is formatted incorrectly.`);
          error.statusCode = 400;
          return next(error);
        }

        // 5. Enum validation
        if (rules.enum && !rules.enum.includes(value)) {
          const error = new Error(`Field '${field}' must be one of: ${rules.enum.join(', ')}.`);
          error.statusCode = 400;
          return next(error);
        }
      }
    }

    next();
  };
};

module.exports = validate;
