export type VoiceSeekBarProps = {
  position: number;
  duration: number;
  disabled: boolean;
  label: string;
  onSeek: (seconds: number) => void;
};
