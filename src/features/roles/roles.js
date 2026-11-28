export const roleOptions = [
  {
    slug: 'customer',
    title: 'Customer',
    description: 'Discover and book trusted local services.',
    icon: 'account-search-outline',
  },
  {
    slug: 'professional',
    title: 'Professional',
    description: 'Manage your services, profile, and bookings.',
    icon: 'briefcase-outline',
  },
  {
    slug: 'business',
    title: 'Business',
    description: 'Coordinate teams and grow your business.',
    icon: 'store-outline',
  },
  {
    slug: 'hiring',
    title: 'Hiring',
    description: 'Find and connect with qualified professionals.',
    icon: 'account-multiple-outline',
  },
];

export const rolesBySlug = Object.fromEntries(
  roleOptions.map((role) => [role.slug, role])
);

export const roleCapabilities = {
  customer: 'customer',
  hiring: 'customer',
  professional: 'professional',
  business: 'business',
};

export const roleSides = {
  customer: 'hiring',
  hiring: 'hiring',
  professional: 'offering',
  business: 'hiring',
};
