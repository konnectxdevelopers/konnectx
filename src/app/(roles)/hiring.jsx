import RoleLandingScreen from '../../features/roles/RoleLandingScreen';
import { rolesBySlug } from '../../features/roles/roles';

export default function HiringRoute() {
  return <RoleLandingScreen role={rolesBySlug.hiring} />;
}
