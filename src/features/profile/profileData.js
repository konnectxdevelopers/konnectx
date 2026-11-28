/**
 * Reference data + profile completion rules shared by the onboarding,
 * profile setup and account screens. These lists are intentionally local:
 * they describe UI options, not remote records.
 */

export const accountTypes = [
  {
    capability: 'customer',
    roleSlug: 'customer',
    icon: 'account-search-outline',
    tone: 'mint',
    side: 'hiring',
  },
  {
    capability: 'professional',
    roleSlug: 'professional',
    icon: 'briefcase-outline',
    tone: 'coral',
    side: 'offering',
  },
  {
    capability: 'business',
    roleSlug: 'business',
    icon: 'store-outline',
    tone: 'blue',
    side: 'both',
  },
  {
    capability: 'provider',
    roleSlug: null,
    icon: 'tools',
    tone: 'amber',
    side: 'offering',
  },
];

export const HIRING_CAPABILITIES = ['customer', 'business'];
export const OFFERING_CAPABILITIES = ['professional', 'business', 'provider'];

export const serviceCategories = [
  { id: 'home-services', icon: 'home-wrench', label: 'Home services' },
  { id: 'repairs', icon: 'tools', label: 'Repairs & maintenance' },
  { id: 'beauty', icon: 'spa-outline', label: 'Beauty & wellness' },
  { id: 'tutoring', icon: 'school-outline', label: 'Tutoring & education' },
  { id: 'events', icon: 'party-popper', label: 'Events & catering' },
  { id: 'transport', icon: 'truck-outline', label: 'Transport & delivery' },
  { id: 'design', icon: 'palette-outline', label: 'Design & creative' },
  { id: 'tech', icon: 'laptop', label: 'Software & tech' },
  { id: 'health', icon: 'heart-pulse', label: 'Health & care' },
  { id: 'photography', icon: 'camera-outline', label: 'Photography' },
  { id: 'cleaning', icon: 'spray-bottle', label: 'Cleaning' },
  { id: 'professional-services', icon: 'briefcase-outline', label: 'Professional services' },
];

export const skillOptions = [
  'Plumbing',
  'Electrical work',
  'Carpentry',
  'Painting',
  'AC repair',
  'Appliance repair',
  'Deep cleaning',
  'Gardening',
  'Moving & packing',
  'Interior design',
  'Photography',
  'Videography',
  'Web development',
  'Mobile development',
  'Graphic design',
  'Content writing',
  'Digital marketing',
  'Tutoring',
  'Translation',
  'Event planning',
  'Catering',
  'Makeup',
  'Hair styling',
  'Fitness training',
  'Massage therapy',
  'Accounting',
  'Legal advice',
  'Delivery',
  'Driving',
  'Pet care',
  'Tailoring',
  'Customer support',
];

export const locationOptions = [
  { id: 'hyderabad', label: 'Hyderabad', region: 'Telangana' },
  { id: 'bengaluru', label: 'Bengaluru', region: 'Karnataka' },
  { id: 'chennai', label: 'Chennai', region: 'Tamil Nadu' },
  { id: 'mumbai', label: 'Mumbai', region: 'Maharashtra' },
  { id: 'delhi', label: 'Delhi', region: 'Delhi NCR' },
  { id: 'pune', label: 'Pune', region: 'Maharashtra' },
  { id: 'kolkata', label: 'Kolkata', region: 'West Bengal' },
  { id: 'ahmedabad', label: 'Ahmedabad', region: 'Gujarat' },
  { id: 'jaipur', label: 'Jaipur', region: 'Rajasthan' },
  { id: 'lucknow', label: 'Lucknow', region: 'Uttar Pradesh' },
  { id: 'kochi', label: 'Kochi', region: 'Kerala' },
  { id: 'visakhapatnam', label: 'Visakhapatnam', region: 'Andhra Pradesh' },
  { id: 'vijayawada', label: 'Vijayawada', region: 'Andhra Pradesh' },
  { id: 'tirupati', label: 'Tirupati', region: 'Andhra Pradesh' },
  { id: 'warangal', label: 'Warangal', region: 'Telangana' },
  { id: 'nagpur', label: 'Nagpur', region: 'Maharashtra' },
  { id: 'indore', label: 'Indore', region: 'Madhya Pradesh' },
  { id: 'chandigarh', label: 'Chandigarh', region: 'Punjab' },
  { id: 'coimbatore', label: 'Coimbatore', region: 'Tamil Nadu' },
  { id: 'mysuru', label: 'Mysuru', region: 'Karnataka' },
];

export const completionSteps = [
  { key: 'photo', weight: 15, labelKey: 'flow.completion.photo' },
  { key: 'headline', weight: 10, labelKey: 'flow.completion.headline' },
  { key: 'bio', weight: 15, labelKey: 'flow.completion.bio' },
  { key: 'location', weight: 15, labelKey: 'flow.completion.location' },
  { key: 'skills', weight: 20, labelKey: 'flow.completion.skills' },
  { key: 'categories', weight: 15, labelKey: 'flow.completion.categories' },
  { key: 'contact', weight: 10, labelKey: 'flow.completion.contact' },
];

function isStepDone(key, profile) {
  switch (key) {
    case 'photo':
      return Boolean(profile?.avatarUri);
    case 'headline':
      return Boolean(profile?.headline?.trim());
    case 'bio':
      return (profile?.bio?.trim()?.length || 0) >= 40;
    case 'location':
      return Boolean(profile?.location);
    case 'skills':
      return (profile?.skills?.length || 0) >= 3;
    case 'categories':
      return (profile?.categories?.length || 0) >= 1;
    case 'contact':
      return Boolean(profile?.phone?.trim());
    default:
      return false;
  }
}

export function computeCompletion(user) {
  const profile = user?.profile || {};
  const steps = completionSteps.map((step) => ({
    ...step,
    done: isStepDone(step.key, profile),
  }));
  const earned = steps.reduce((total, step) => (step.done ? total + step.weight : total), 0);
  const percent = Math.min(100, Math.round(earned));

  return {
    percent,
    steps,
    missing: steps.filter((step) => !step.done),
  };
}
