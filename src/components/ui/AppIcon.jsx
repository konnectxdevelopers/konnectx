import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';

export default function AppIcon({
  name,
  size = 22,
  color = colors.text,
  ...props
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} {...props} />;
}
