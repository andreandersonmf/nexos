export function Logo({ size = 'md', showText = true }) {
  const dims = size === 'lg' ? 'w-11 h-11 text-xl' : size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-base';
  const textSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl';
  return (
    <div className="flex items-center gap-2">
      <div className={`${dims} rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center shadow-sm`}>
        N
      </div>
      {showText && (
        <span className={`${textSize} font-semibold text-slate-900 tracking-tight`}>Nexo's</span>
      )}
    </div>
  );
}
