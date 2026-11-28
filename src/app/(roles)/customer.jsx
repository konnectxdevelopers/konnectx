import RoleLandingScreen from '../../features/roles/RoleLandingScreen';
import { rolesBySlug } from '../../features/roles/roles';

export default function CustomerRoute() {
  return <RoleLandingScreen role={rolesBySlug.customer} />;
}
