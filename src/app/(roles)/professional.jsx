import RoleLandingScreen from '../../features/roles/RoleLandingScreen';
import { rolesBySlug } from '../../features/roles/roles';

export default function ProfessionalRoute() {
  return <RoleLandingScreen role={rolesBySlug.professional} />;
}
