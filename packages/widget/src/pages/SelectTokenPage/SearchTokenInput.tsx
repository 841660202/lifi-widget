import { Search as SearchIcon } from '@mui/icons-material';
import { FormControl, InputAdornment } from '@mui/material';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CardContainer } from '../../components/Card';
import { SwapFormKey } from '../../providers/SwapFormProvider';
import { Input } from './SearchTokenInput.style';

export const SearchTokenInput = () => {
  const { t } = useTranslation();
  const { register, setValue } = useFormContext();

  useEffect(
    () => () => {
      setValue(SwapFormKey.SearchTokensFilter, '');
    },
    [setValue],
  );

  return (
    <CardContainer>
      <FormControl fullWidth>
        <Input
          size="small"
          placeholder={t(`swap.tokenSearch`)}
          defaultValue=""
          endAdornment={
            <InputAdornment position="end">
              <SearchIcon />
            </InputAdornment>
          }
          inputProps={{
            inputMode: 'search',
            ...register(SwapFormKey.SearchTokensFilter),
          }}
          autoComplete="off"
        />
      </FormControl>
    </CardContainer>
  );
};