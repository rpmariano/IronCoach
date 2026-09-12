/**
 */
export interface WarningProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  /** botões por baixo (Tentar de novo, Entendido) */
  actions?: React.ReactNode;
  /** warn por defeito; ok para o insight positivo; danger para erro de sistema */
  tone?: 'warn' | 'ok' | 'danger';
  style?: React.CSSProperties;
}
export function Warning(props: WarningProps): JSX.Element;
