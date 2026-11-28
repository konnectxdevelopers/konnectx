import RoleLandingScreen from '../../features/roles/RoleLandingScreen';
import { rolesBySlug } from '../../features/roles/roles';

export default function BusinessRoute() {
  return <RoleLandingScreen role={rolesBySlug.business} />;
}
