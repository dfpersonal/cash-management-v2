import React from 'react';
import { FormControl, InputLabel, Select, SelectProps, FormControlProps } from '@mui/material';
import { useViewMode } from './ViewModeContext';

interface SmartSelectProps extends Omit<FormControlProps, 'children'> {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  selectProps?: Omit<SelectProps, 'disabled' | 'label'>;
  labelId?: string;
}

export const SmartSelect: React.FC<SmartSelectProps> = ({
  label,
  children,
  disabled = false,
  selectProps,
  labelId,
  sx,
  ...formControlProps
}) => {
  const { viewMode } = useViewMode();
  const isReadOnly = disabled || viewMode === 'view';
  const generatedLabelId = labelId || `smart-select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <FormControl 
      {...formControlProps}
      sx={{
        ...sx,
        // Add subtle visual styling for read-only fields
        ...(viewMode === 'view' && {
          '& .MuiInputLabel-root': {
            color: 'text.secondary',
          },
          '& .MuiSelect-select': {
            color: 'text.primary',
          },
        })
      }}
    >
      <InputLabel id={generatedLabelId}>{label}</InputLabel>
      <Select
        {...selectProps}
        labelId={generatedLabelId}
        label={label}
        disabled={isReadOnly}
      >
        {children}
      </Select>
    </FormControl>
  );
};