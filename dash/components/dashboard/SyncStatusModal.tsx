type SyncStatusModalProps = {
  title: string
  message: string
  onClose: () => void
}

export function SyncStatusModal({ title, message, onClose }: SyncStatusModalProps) {
  return (
    <div className="modal-scrim modal-scrim-critical" onClick={onClose}>
      <div className="modal-card status-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header compact">
          <div>
            <p className="panel-eyebrow">Sincronizacao</p>
            <h3>{title}</h3>
          </div>
        </div>
        <p className="status-modal-copy">{message}</p>
        <div className="modal-actions-row status-modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
