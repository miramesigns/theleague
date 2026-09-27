type TeamNameWithRecordProps = {
  name: string;
  record?: string | null;
  className?: string;
};

/** Bold team name with an optional muted compact record that never truncates first. */
export function TeamNameWithRecord({ name, record, className }: TeamNameWithRecordProps) {
  return (
    <div className={className ? `team-name-line ${className}` : 'team-name-line'}>
      <span className="team-name">{name}</span>
      {record ? <span className="team-record">({record})</span> : null}
    </div>
  );
}

export function teamNameAriaLabel(name: string, record?: string | null): string {
  return record ? `${name} (${record})` : name;
}
