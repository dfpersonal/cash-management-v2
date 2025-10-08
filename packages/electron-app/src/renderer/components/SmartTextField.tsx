import React from 'react';
import { TextField, TextFieldProps } from '@mui/material';
import { useViewMode } from './ViewModeContext';

interface SmartTextFieldProps extends Omit<TextFieldProps, 'disabled'> {
  disabled?: boolean; // Allow manual override
}

export const SmartTextField: React.FC<SmartTextFieldProps> = ({
  disabled = false,
  sx,
  ...props
}) => {
  const { viewMode } = useViewMode();
  const isReadOnly = disabled || viewMode === 'view';
  
  return (
    <TextField
      {...props}
      disabled={isReadOnly}
      sx={{
        ...sx,
        // Add subtle visual styling for read-only fields
        ...(viewMode === 'view' && {
          '& .MuiInputBase-input': {
            color: 'text.primary',
          },
          '& .MuiInputLabel-root': {
            color: 'text.secondary',
          },
        })
      }}
    />
  );
};