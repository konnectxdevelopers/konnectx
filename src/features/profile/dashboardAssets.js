export const dashboardAssets = {
  customer: require('../../../assets/dashboard/customer-home.jpg'),
  professional: require('../../../assets/dashboard/professional-work.jpg'),
  business: require('../../../assets/dashboard/business-office.jpg'),
  hiring: require('../../../assets/dashboard/hiring-team.jpg'),
  categories: {
    home: require('../../../assets/dashboard/customer-home.jpg'),
    electrical: require('../../../assets/dashboard/category-electrical.jpg'),
    beauty: require('../../../assets/dashboard/category-beauty.jpg'),
    plumbing: require('../../../assets/dashboard/category-plumbing.jpg'),
    design: require('../../../assets/dashboard/category-design.jpg'),
  },
};

export function dashboardArtworkForCategory(label = '') {
  const category = String(label).toLowerCase();
  if (/beauty|wellness|salon|makeup|hair|spa/.test(category)) {
    return dashboardAssets.categories.beauty;
  }
  if (/plumb|pipe|water/.test(category)) {
    return dashboardAssets.categories.plumbing;
  }
  if (/design|creative|graphic|software|tech|web/.test(category)) {
    return dashboardAssets.categories.design;
  }
  if (/clean|home|repair|electrical|maintenance|appliance/.test(category)) {
    return category.includes('clean')
      ? dashboardAssets.categories.home
      : dashboardAssets.categories.electrical;
  }
  return dashboardAssets.professional;
}
