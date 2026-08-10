import { AppNav, LogoMark } from './AppNav';
import { PageBackdrop } from './PageBackdrop';

/**
 * Full-screen auth layout: sticky nav + centered card + hero backdrop. Every
 * auth page mounts through this so they all share the same first impression.
 */
export function AuthShell({
  title,
  subtitle,
  icon,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      <AppNav />
      <PageBackdrop />
      <div className="relative flex items-center justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center mb-4">
                {icon ?? <LogoMark size="lg" />}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {title}
              </h1>
              {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
            </div>
            {children}
          </div>
          {footer && <div className="mt-6 text-center">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
