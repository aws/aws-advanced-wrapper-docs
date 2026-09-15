import ComponentTypes from '@theme-original/NavbarItem/ComponentTypes';
import WrapperSwitcher from '@site/src/components/WrapperSwitcher';

// Register our custom navbar item type: { type: 'custom-wrapperSwitcher' }.
export default {
  ...ComponentTypes,
  'custom-wrapperSwitcher': WrapperSwitcher,
};
