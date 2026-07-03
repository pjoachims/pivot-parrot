#!/bin/bash

# Script to fix import paths after clean architecture refactoring

cd src

# Fix domain layer imports
find domain -name "*.ts" -type f -exec sed -i '' \
  -e "s|from '../../../shared/types/types'|from '../models/types'|g" \
  -e "s|from '../../shared/types/types'|from '../models/types'|g" \
  -e "s|from '../../../shared/state/store'|from '../../application/state/store'|g" \
  -e "s|from '../../core/FieldItem'|from '../field/FieldItem'|g" \
  -e "s|from '../core/FieldItem'|from '../field/FieldItem'|g" \
  -e "s|from './FieldItem'|from '../field/FieldItem'|g" \
  {} \;

# Fix infrastructure layer imports
find infrastructure -name "*.ts" -type f -exec sed -i '' \
  -e "s|from '../../../shared/types/types'|from '../domain/models/types'|g" \
  -e "s|from '../../shared/types/types'|from '../domain/models/types'|g" \
  -e "s|from '../core/FieldItem'|from '../domain/field/FieldItem'|g" \
  {} \;

# Fix application layer imports
find application -name "*.ts" -type f -exec sed -i '' \
  -e "s|from '../../../shared/types/types'|from '../domain/models/types'|g" \
  -e "s|from '../../shared/types/types'|from '../domain/models/types'|g" \
  -e "s|from '../../types/types'|from '../domain/models/types'|g" \
  -e "s|from '../types/types'|from '../domain/models/types'|g" \
  {} \;

# Fix presentation layer imports
find presentation -name "*.ts" -name "*.tsx" -type f -exec sed -i '' \
  -e "s|from '../../../shared/types/types'|from '../../domain/models/types'|g" \
  -e "s|from '../../shared/types/types'|from '../../domain/models/types'|g" \
  -e "s|from '../../../shared/state/store'|from '../../application/state/store'|g" \
  -e "s|from '../../shared/state/store'|from '../../application/state/store'|g" \
  {} \;

echo "Import paths fixed!"
