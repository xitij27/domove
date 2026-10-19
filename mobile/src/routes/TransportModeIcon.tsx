import { View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useStrings } from '../i18n';
import type { TransportMode } from './model';

const ICONS: Record<TransportMode, React.ComponentProps<typeof MaterialIcons>['name']> = {
  car: 'directions-car',
  bike: 'directions-bike',
  pedestrian: 'directions-walk',
};

export default function TransportModeIcon({
  mode,
  size = 22,
  color = '#8a4510',
}: {
  mode: TransportMode;
  size?: number;
  color?: string;
}) {
  const t = useStrings();
  return (
    <View accessibilityRole="image" accessibilityLabel={t.modes[mode]}>
      <MaterialIcons name={ICONS[mode]} size={size} color={color} />
    </View>
  );
}
