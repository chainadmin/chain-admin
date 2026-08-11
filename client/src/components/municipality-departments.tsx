import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Plus, Trash2 } from 'lucide-react';

type Department = { id: string; name: string; description?: string | null; isActive: boolean };

export default function MunicipalityDepartments() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: departments = [] } = useQuery<Department[]>({ queryKey: ['/api/municipality/departments'] });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/api/municipality/departments'] });
  const create = useMutation({ mutationFn: () => apiRequest('POST', '/api/municipality/departments', { name, description }), onSuccess: () => { setName(''); setDescription(''); refresh(); toast({ title: 'Department created' }); } });
  const remove = useMutation({ mutationFn: (id: string) => apiRequest('DELETE', `/api/municipality/departments/${id}`), onSuccess: () => { refresh(); toast({ title: 'Department deleted' }); } });
  const update = useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<Department> }) => apiRequest('PATCH', `/api/municipality/departments/${id}`, data), onSuccess: () => { refresh(); toast({ title: 'Department updated' }); } });

  return <Card className="border-white/10 bg-white/5 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Departments</CardTitle></CardHeader><CardContent className="space-y-6">
    <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]"><div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Public Works" className="mt-2" /></div><div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional department description" className="mt-2" /></div><Button className="self-end" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}><Plus className="mr-2 h-4 w-4" />Add</Button></div>
    <div className="space-y-2">{departments.map(department => <div key={department.id} className="flex items-center justify-between rounded-xl border border-white/10 p-4"><div><p className="font-medium">{department.name}</p>{department.description && <p className="text-sm text-blue-100/60">{department.description}</p>}<p className="text-xs text-blue-100/50">{department.isActive ? 'Active' : 'Inactive'}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => update.mutate({ id: department.id, data: { isActive: !department.isActive } })}>{department.isActive ? 'Deactivate' : 'Reactivate'}</Button><Button variant="ghost" size="sm" onClick={() => remove.mutate(department.id)}><Trash2 className="h-4 w-4 text-red-300" /></Button></div></div>)}{!departments.length && <p className="py-6 text-center text-blue-100/60">Create departments that match your municipality's organization.</p>}</div>
  </CardContent></Card>;
}
