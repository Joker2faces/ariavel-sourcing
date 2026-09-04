import { useEffect, useMemo, useState } from 'react';
import type { SupplierService } from '../../backend/services/supplierService';
import { supplierFieldDefinitions } from '../../shared/mapping/supplierMapping';
import type { MondayBoardDescriptor, SupplierFieldKey, SupplierFieldMapping } from '../../shared/types/domain';
import { Drawer } from './SupplierFormDrawer';

export function SupplierSourceDrawer({ service, onClose, onSaved }: { service: SupplierService; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'ARIAVEL' | 'MONDAY_BOARD'>('ARIAVEL');
  const [boards, setBoards] = useState<MondayBoardDescriptor[]>([]);
  const [boardId, setBoardId] = useState('');
  const [mappings, setMappings] = useState<SupplierFieldMapping[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void service.listBoards().then(setBoards); }, [service]);
  const board = boards.find(candidate => candidate.id === boardId);
  const validation = useMemo(() => board ? service.validateBoardMapping(board, mappings) : undefined, [board, mappings, service]);
  const preview = useMemo(() => board && validation?.valid ? service.previewBoardMapping(board, mappings) : [], [board, mappings, service, validation?.valid]);
  const mappingFor = (field: SupplierFieldKey) => mappings.find(mapping => mapping.supplierField === field)?.mondayColumnId ?? '';
  const updateMapping = (field: SupplierFieldKey, mondayColumnId: string) => setMappings(current => [...current.filter(mapping => mapping.supplierField !== field), ...(mondayColumnId ? [{ supplierField: field, mondayColumnId }] : [])]);
  const save = async () => {
    setSaving(true);
    try {
      if (mode === 'ARIAVEL') await service.saveSourceConfiguration({ mode: 'ARIAVEL' });
      else if (board && validation?.valid) await service.saveSourceConfiguration({ mode: 'MONDAY_BOARD', boardMapping: { boardId: board.id, fieldMappings: mappings, configuredAt: new Date().toISOString() } });
      onSaved();
    } finally { setSaving(false); }
  };
  return <Drawer title="Configure supplier source" onClose={onClose}>
    <div className="source-options"><label className={mode === 'ARIAVEL' ? 'selected' : ''}><input aria-label="Ariavel-managed supplier list" type="radio" name="source" checked={mode === 'ARIAVEL'} onChange={() => setMode('ARIAVEL')} /><span><strong>Ariavel-managed supplier list</strong><small>Maintain suppliers directly in Ariavel for this account.</small></span></label><label className={mode === 'MONDAY_BOARD' ? 'selected' : ''}><input aria-label="Existing monday board" type="radio" name="source" checked={mode === 'MONDAY_BOARD'} onChange={() => setMode('MONDAY_BOARD')} /><span><strong>Existing monday board</strong><small>Connect supplier records through a normalized board mapping.</small></span></label></div>
    {mode === 'MONDAY_BOARD' ? <div className="mapping-workflow"><label className="field" htmlFor="supplier-board"><span>Supplier board</span><select id="supplier-board" value={boardId} onChange={event => { setBoardId(event.target.value); setMappings([]); }}><option value="">Choose a board</option>{boards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {board ? <><div className="mapping-header"><h3>Column mapping</h3><p>Supplier Name is required. Optional fields can be added later.</p></div><div className="mapping-table">{supplierFieldDefinitions.map(definition => { const issue = validation?.issues.find(item => item.supplierField === definition.key); return <div className="mapping-row" key={definition.key}><div><strong>{definition.label}</strong><small>{definition.required ? 'Required' : 'Optional'}</small></div><label><span className="sr-only">{definition.label} monday column</span><select aria-label={`${definition.label} monday column`} value={mappingFor(definition.key)} onChange={event => updateMapping(definition.key, event.target.value)}><option value="">Not mapped</option>{board.columns.map(column => <option key={column.id} value={column.id}>{column.title} · {column.type}</option>)}</select></label><span className={`mapping-state state-${issue?.kind.toLowerCase()}`}>{issue?.kind === 'MISSING_REQUIRED' ? 'Required' : issue?.kind === 'WARNING' ? 'Review type' : issue?.kind === 'VALID' ? 'Compatible' : 'Optional'}</span></div>; })}</div>
      {!validation?.valid ? <p className="mapping-error">Supplier Name must be mapped.</p> : null}
      {preview.length ? <section className="mapping-preview"><h3>Preview mapped suppliers</h3><p>Fictional sample data from the selected development provider.</p><div className="preview-list">{preview.map((item, index) => <div key={String(item.mondayItemId ?? index)}><strong>{String(item.name ?? 'Unnamed supplier')}</strong><span>{[item.category, item.country, item.email].filter(Boolean).map(String).join(' · ') || 'Only required fields mapped'}</span></div>)}</div></section> : null}</> : null}</div> : <div className="source-note"><strong>Ariavel will manage supplier records.</strong><p>Supplier records are stored securely for this account and managed by Ariavel.</p></div>}
    <div className="drawer-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => void save()} disabled={saving || (mode === 'MONDAY_BOARD' && (!board || !validation?.valid))}>{saving ? 'Saving…' : 'Save source configuration'}</button></div>
  </Drawer>;
}
