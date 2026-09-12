/**
 */
export interface SheetProps {
  open?: boolean;
  title?: string;
  eyebrow?: string;
  onClose?: () => void;
  children: React.ReactNode;
  maxHeight?: number;
}
export function Sheet(props: SheetProps): JSX.Element;
