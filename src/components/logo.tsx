import { Image } from 'react-native';

type Props = { size?: number; showName?: boolean };

export default function Logo({ size = 56, showName = true }: Props) {
  if (showName) {
    const height = size * 2.4;
    return (
      <Image
        source={require('../../assets/logo.png')}
        style={{ width: height * 1.2, height }}
        resizeMode="contain"
      />
    );
  }

  return (
    <Image
      source={require('../../assets/logo-mark.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}