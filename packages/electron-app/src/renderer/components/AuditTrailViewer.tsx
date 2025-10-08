import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Collapse
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  History as HistoryIcon
} from '@mui/icons-material';

interface AuditLogEntry {
  id: number;
  table_name: string;
  record_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  operation_context: string;
  timestamp: string;
  notes?: string;
}

interface AuditTrailViewerProps {
  open: boolean;
  onClose: () => void;
  tableName: string;
  recordId: number;
  title?: string;
  refreshTrigger?: number;
}

export const AuditTrailViewer: React.FC<AuditTrailViewerProps> = ({
  open,
  onClose,
  tableName,
  recordId,
  title,
  refreshTrigger
}) => {
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open && tableName && recordId) {
      loadAuditTrail();
    }
  }, [open, tableName, recordId, refreshTrigger]);

  const loadAuditTrail = async () => {
    setLoading(true);
    try {
      // This would call the audit service through IPC
      const entries = await window.electronAPI.getRecordAuditTrail(tableName, recordId);
      setAuditEntries(entries || []);
    } catch (error) {
      console.error('Failed to load audit trail:', error);
      setAuditEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleRowExpansion = (entryId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedRows(newExpanded);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatFieldName = (fieldName: string) => {
    return fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getOperationColor = (operation: string): 'primary' | 'success' | 'warning' | 'error' => {
    if (operation.includes('CREATE')) return 'success';
    if (operation.includes('UPDATE')) return 'primary';
    if (operation.includes('DELETE')) return 'error';
    return 'warning';
  };

  const getValueDisplay = (value: string, isExpanded: boolean) => {
    if (!value) return <em style={{ color: '#666' }}>empty</em>;
    
    if (value.length > 50 && !isExpanded) {
      return `${value.substring(0, 50)}...`;
    }
    
    return value;
  };

  // Group entries by timestamp to show related changes together
  const groupedEntries = auditEntries.reduce((groups, entry) => {
    const timestamp = entry.timestamp;
    if (!groups[timestamp]) {
      groups[timestamp] = [];
    }
    groups[timestamp].push(entry);
    return groups;
  }, {} as Record<string, AuditLogEntry[]>);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <HistoryIcon />
          <Typography variant="h6">
            Audit Trail - {title || `${tableName} #${recordId}`}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Typography>Loading audit trail...</Typography>
        ) : auditEntries.length === 0 ? (
          <Typography color="textSecondary">
            No audit trail found for this record.
          </Typography>
        ) : (
          <Box>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Showing {auditEntries.length} audit entries grouped by operation
            </Typography>
            
            {Object.entries(groupedEntries)
              .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
              .map(([timestamp, entries]) => (
                <Paper key={timestamp} sx={{ mb: 2, p: 2 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={1}>
                    <Chip
                      label={entries[0].operation_context}
                      color={getOperationColor(entries[0].operation_context)}
                      size="small"
                    />
                    <Typography variant="body2" color="textSecondary">
                      {formatTimestamp(timestamp)}
                    </Typography>
                    {entries[0].notes && (
                      <Typography variant="body2" style={{ fontStyle: 'italic' }}>
                        {entries[0].notes}
                      </Typography>
                    )}
                  </Box>
                  
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell width="20%">Field</TableCell>
                          <TableCell width="35%">Previous Value</TableCell>
                          <TableCell width="35%">New Value</TableCell>
                          <TableCell width="10%" align="center">Details</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {entries.map((entry) => {
                          const isExpanded = expandedRows.has(entry.id);
                          const hasLongValues = 
                            (entry.old_value && entry.old_value.length > 50) ||
                            (entry.new_value && entry.new_value.length > 50);
                          
                          return (
                            <React.Fragment key={entry.id}>
                              <TableRow>
                                <TableCell>
                                  <Typography variant="body2" fontWeight="medium">
                                    {formatFieldName(entry.field_name)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      backgroundColor: entry.old_value ? '#fff3e0' : 'transparent',
                                      padding: entry.old_value ? '4px 8px' : 0,
                                      borderRadius: 1,
                                      fontFamily: 'monospace'
                                    }}
                                  >
                                    {getValueDisplay(entry.old_value, isExpanded)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography 
                                    variant="body2"
                                    sx={{ 
                                      backgroundColor: entry.new_value ? '#e8f5e8' : 'transparent',
                                      padding: entry.new_value ? '4px 8px' : 0,
                                      borderRadius: 1,
                                      fontFamily: 'monospace'
                                    }}
                                  >
                                    {getValueDisplay(entry.new_value, isExpanded)}
                                  </Typography>
                                </TableCell>
                                <TableCell align="center">
                                  {hasLongValues && (
                                    <IconButton
                                      size="small"
                                      onClick={() => toggleRowExpansion(entry.id)}
                                    >
                                      {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    </IconButton>
                                  )}
                                </TableCell>
                              </TableRow>
                              
                              {hasLongValues && (
                                <TableRow>
                                  <TableCell colSpan={4} sx={{ py: 0 }}>
                                    <Collapse in={isExpanded}>
                                      <Box sx={{ py: 2 }}>
                                        <Typography variant="body2" fontWeight="medium" gutterBottom>
                                          Full Values:
                                        </Typography>
                                        
                                        {entry.old_value && (
                                          <Box mb={1}>
                                            <Typography variant="caption" color="textSecondary">
                                              Previous:
                                            </Typography>
                                            <Paper sx={{ p: 1, backgroundColor: '#fff3e0' }}>
                                              <Typography 
                                                variant="body2" 
                                                sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
                                              >
                                                {entry.old_value}
                                              </Typography>
                                            </Paper>
                                          </Box>
                                        )}
                                        
                                        {entry.new_value && (
                                          <Box>
                                            <Typography variant="caption" color="textSecondary">
                                              New:
                                            </Typography>
                                            <Paper sx={{ p: 1, backgroundColor: '#e8f5e8' }}>
                                              <Typography 
                                                variant="body2" 
                                                sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
                                              >
                                                {entry.new_value}
                                              </Typography>
                                            </Paper>
                                          </Box>
                                        )}
                                      </Box>
                                    </Collapse>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              ))}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};