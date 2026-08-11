import AdminLayout from '@/components/admin-layout';
import MunicipalityDepartments from '@/components/municipality-departments';
import TeamMembersSection from '@/components/team-members-section';

export default function MunicipalityAdmin() {
  return <AdminLayout><main className="mx-auto max-w-7xl space-y-8 px-4 py-8"><div className="text-white"><p className="text-sm font-semibold uppercase tracking-widest text-sky-300">Municipality administration</p><h1 className="mt-2 text-3xl font-bold">Users & departments</h1><p className="mt-2 text-blue-100/70">The Primary Administrator can manage municipal staff, access, and department organization.</p></div><MunicipalityDepartments /><TeamMembersSection cardBaseClasses="border-white/10 bg-white/5" inputClasses="border-white/10 bg-white/5 text-white" /></main></AdminLayout>;
}
