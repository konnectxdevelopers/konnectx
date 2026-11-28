function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error('Service category rules contain invalid JSON.', { cause: error });
  }
}

function parseStringArray(value, fieldName) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error(`Service category rule ${fieldName} must be a string array.`);
  }
  return parsed;
}

const DEFAULT_RULES = Object.freeze({
  requiresLocation: false,
  supportsCoverageRadius: true,
  supportsDuration: true,
  supportsAvailability: true,
  supportsBookingLeadTime: true,
  supportsPackages: true,
  allowedDeliveryMethods: ['customer_location', 'provider_location', 'online', 'remote', 'hybrid'],
  allowedPricingTypes: ['fixed', 'hourly', 'per_visit', 'per_day', 'negotiable', 'starting_from', 'quote_required'],
  requiredFields: ['title', 'shortDescription', 'description', 'categoryId', 'pricingType', 'deliveryMethod'],
  attributes: [],
});

export function formatServiceCategoryRules(row) {
  if (!row) return { ...DEFAULT_RULES };
  const attributes = parseJson(row.attributes, []);
  if (!Array.isArray(attributes) || attributes.some((item) =>
    !item ||
    typeof item !== 'object' ||
    Array.isArray(item) ||
    typeof item.key !== 'string' ||
    !item.key.trim()
  )) {
    throw new Error('Service category rule attributes must be an array of objects.');
  }
  return {
    requiresLocation: Boolean(row.requires_location),
    supportsCoverageRadius: Boolean(row.supports_coverage_radius),
    supportsDuration: Boolean(row.supports_duration),
    supportsAvailability: Boolean(row.supports_availability),
    supportsBookingLeadTime: Boolean(row.supports_booking_lead_time),
    supportsPackages: Boolean(row.supports_packages),
    allowedDeliveryMethods: parseStringArray(row.allowed_delivery_methods, 'allowed_delivery_methods'),
    allowedPricingTypes: parseStringArray(row.allowed_pricing_types, 'allowed_pricing_types'),
    requiredFields: parseStringArray(row.required_fields, 'required_fields'),
    attributes,
  };
}

export async function loadServiceCategoryRules(pool, categoryId) {
  const [rows] = await pool.query(
    'SELECT * FROM service_category_rules WHERE category_id = ? LIMIT 1',
    [categoryId]
  );
  return formatServiceCategoryRules(rows[0]);
}

export async function loadServiceCategoryRulesMap(pool) {
  const [rows] = await pool.query('SELECT * FROM service_category_rules');
  return new Map(rows.map((row) => [row.category_id, formatServiceCategoryRules(row)]));
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function fieldValue(payload, field) {
  if (field.startsWith('customAttributes.')) {
    return payload.customAttributes?.[field.slice('customAttributes.'.length)];
  }
  return payload[field];
}

export function validateServiceCategoryRules(rules, payload, { requireComplete = false } = {}) {
  if (rules.allowedDeliveryMethods.length && !rules.allowedDeliveryMethods.includes(payload.deliveryMethod)) {
    return {
      code: 'invalid_delivery_method',
      message: `Delivery method ${payload.deliveryMethod} is not supported for this category.`,
    };
  }
  if (rules.allowedPricingTypes.length && !rules.allowedPricingTypes.includes(payload.pricingType)) {
    return {
      code: 'invalid_pricing_type',
      message: `Pricing model ${payload.pricingType} is not supported for this category.`,
    };
  }

  if (!requireComplete) return null;

  if (rules.requiresLocation && !payload.locations?.length) {
    return { code: 'location_required', message: 'Add a city or service area for this service category.' };
  }
  if (!rules.supportsCoverageRadius && payload.locations?.some((item) => hasValue(item.radiusKm))) {
    return { code: 'unsupported_coverage_radius', message: 'Coverage radius is not supported for this category.' };
  }
  if (!rules.supportsDuration && hasValue(payload.durationValue)) {
    return { code: 'unsupported_duration', message: 'Estimated duration is not supported for this category.' };
  }
  if (!rules.supportsAvailability && payload.availability?.length) {
    return { code: 'unsupported_availability', message: 'Availability schedules are not supported for this category.' };
  }
  if (!rules.supportsBookingLeadTime && hasValue(payload.bookingLeadTimeHours)) {
    return { code: 'unsupported_booking_lead_time', message: 'Booking lead time is not supported for this category.' };
  }
  if (!rules.supportsPackages && payload.packages?.length) {
    return { code: 'unsupported_packages', message: 'Packages are not supported for this category.' };
  }

  for (const field of rules.requiredFields) {
    if (!hasValue(fieldValue(payload, field))) {
      return { code: 'required_service_field', message: `${field} is required for this service category.` };
    }
  }

  const declaredAttributes = new Map(rules.attributes.map((attribute) => [attribute.key, attribute]));
  for (const [key, value] of Object.entries(payload.customAttributes || {})) {
    if (!hasValue(value)) continue;
    const attribute = declaredAttributes.get(key);
    if (!attribute) {
      return { code: 'invalid_service_attribute', message: `${key} is not a supported attribute for this category.` };
    }
    if (attribute.type === 'select' && !attribute.options?.includes(value)) {
      return { code: 'invalid_service_attribute', message: `Choose a valid value for ${attribute.label || key}.` };
    }
    if (attribute.type === 'number' && !Number.isFinite(Number(value))) {
      return { code: 'invalid_service_attribute', message: `${attribute.label || key} must be a number.` };
    }
    if (attribute.type === 'text' && typeof value !== 'string') {
      return { code: 'invalid_service_attribute', message: `${attribute.label || key} must be text.` };
    }
  }
  for (const attribute of rules.attributes) {
    if (attribute.required && !hasValue(payload.customAttributes?.[attribute.key])) {
      return {
        code: 'required_service_attribute',
        message: `${attribute.label || attribute.key} is required for this service category.`,
      };
    }
  }
  return null;
}
