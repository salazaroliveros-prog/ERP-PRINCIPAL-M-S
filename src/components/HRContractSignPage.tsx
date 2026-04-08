import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from './SignaturePad';
import { getContractForSigning, submitWorkerContractSignature, EmploymentContractRecord } from '../lib/hrApi';
import { formatCurrency } from '../lib/utils';

function getTokenFromHash() {
  const hash = window.location.hash || '';
  const marker = '#/hr/contract-sign/';
  if (!hash.startsWith(marker)) return '';
  return decodeURIComponent(hash.slice(marker.length));
}

export default function HRContractSignPage() {
  const [contract, setContract] = useState<EmploymentContractRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const token = useMemo(() => getTokenFromHash(), []);

  useEffect(() => {
    async function load() {
      try {
        if (!token) throw new Error('Enlace de firma no valido');
        const data = await getContractForSigning(token);
        setContract(data);
      } catch (error: any) {
        toast.error(error?.message || 'No se pudo cargar el contrato');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signature) {
      toast.error('Debes ingresar tu firma');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await submitWorkerContractSignature(token, {
        workerSignatureDataUrl: signature,
        workerName,
      });
      setContract(updated);
      toast.success('Firma registrada correctamente. RRHH ya puede finalizar el contrato.');
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo registrar la firma');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <h1 className="text-2xl font-black text-slate-900">Contrato no disponible</h1>
          <p className="text-sm text-slate-600 mt-2">El enlace puede haber expirado o no existir.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-2xl font-black text-slate-900">Firma de Contrato Laboral</h1>
          <p className="text-slate-600 mt-1">WM_M&S Constructora</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-slate-500">Empleado</p>
              <p className="font-bold text-slate-900">{contract.employeeName}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-slate-500">Cargo</p>
              <p className="font-bold text-slate-900">{contract.employeeRole}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-slate-500">Fecha inicio</p>
              <p className="font-bold text-slate-900">{contract.startDate}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-slate-500">Salario mensual</p>
              <p className="font-bold text-slate-900">{formatCurrency(contract.salary)}</p>
            </div>
          </div>

          {contract.status === 'worker_signed' || contract.status === 'completed' ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
              Este contrato ya fue firmado por el trabajador.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest font-black text-slate-400">Nombre completo</label>
                <input
                  type="text"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  placeholder={contract.employeeName}
                  className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest font-black text-slate-400">Firma digital</label>
                <SignaturePad onChange={setSignature} />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-primary text-white font-black uppercase tracking-widest disabled:opacity-60"
              >
                {submitting ? 'Guardando firma...' : 'Firmar Contrato'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
