import { useEffect, useState } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import WikiAISidebar from './WikiAISidebar';

export default function WikiLayout() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const [currentSpace, setCurrentSpace] = useState(spaceId);

  useEffect(() => {
    if (spaceId !== currentSpace) {
      setCurrentSpace(spaceId);
    }
  }, [spaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Outlet />
      {currentSpace && (
        <WikiAISidebar
          spaceId={currentSpace}
          onCiteClick={(pageId) => {
            if (currentSpace) navigate(`/wiki/${currentSpace}/page/${pageId}`);
          }}
        />
      )}
    </>
  );
}
