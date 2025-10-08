import React from 'react';
import { FormControlLabel, Checkbox, CheckboxProps, FormControlLabelProps } from '@mui/material';
import { useViewMode } from './ViewModeContext';

interface SmartCheckboxProps extends Omit<FormControlLabelProps, 'control'> {
  label: string;
  disabled?: boolean;
  checkboxProps?: Omit<CheckboxProps, 'disabled'>;
}

export const SmartCheckbox: React.FC<SmartCheckboxProps> = ({
  label,
  disabled = false,
  checkboxProps,
  sx,
  ...formControlLabelProps
}) => {
  const { viewMode } = useViewMode();
  const isReadOnly = disabled || viewMode === 'view';
  
  return (
    <FormControlLabel
      {...formControlLabelProps}
      control={
        <Checkbox
          {...checkboxProps}
          disabled={isReadOnly}
        />
      }
      label={label}
      sx={{
        ...sx,
        // Add subtle visual styling for read-only fields
        ...(viewMode === 'view' && {
          '& .MuiFormControlLabel-label': {
            color: 'text.secondary',
          },
        })
      }}
    />
  );
};