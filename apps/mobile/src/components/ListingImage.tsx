import { View, type ViewStyle } from "react-native";
import { Image, type ImageStyle } from "expo-image";
import { useTheme } from "../theme";
import { AppText } from "./Text";
import type { ImageRef } from "../domain/models";

export interface ListingImageProps {
  image: ImageRef | undefined;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/**
 * Renders a listing image. Placeholder images are an emoji on a soft tinted tile
 * (no remote images anywhere); a picked local image renders from its device URI.
 */
export function ListingImage({ image, height = 160, radius, style }: ListingImageProps) {
  const theme = useTheme();
  const r = radius ?? theme.radii.md;

  if (image?.kind === "local") {
    return (
      <Image
        source={{ uri: image.value }}
        style={[{ width: "100%", height, borderRadius: r, backgroundColor: theme.colors.surfaceMuted }, style as ImageStyle]}
        contentFit="cover"
        transition={120}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: "100%",
          height,
          borderRadius: r,
          backgroundColor: theme.colors.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <AppText style={{ fontSize: Math.min(height * 0.42, 72) }}>{image?.value ?? "📦"}</AppText>
    </View>
  );
}
