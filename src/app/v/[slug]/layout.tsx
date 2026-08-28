export default function PublicShowcaseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen w-full bg-surface">
      {children}
    </div>
  )
}
